import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, type ListaDb, type PozycjaDb } from './lib/supabase'
import type { Lista, Pozycja } from './pozycje'

function listaZBazy(l: ListaDb): Lista {
  return { id: l.id, nazwa: l.name }
}

function pozycjaZBazy(p: PozycjaDb): Pozycja {
  return {
    id: p.id,
    listaId: p.list_id,
    nazwa: p.name,
    ilosc: p.quantity,
    kupione: p.done,
    autorId: p.created_by,
    dodano: p.created_at,
  }
}

/**
 * Listy zakupów i ich pozycje, odświeżane na żywo.
 *
 * Pobieramy wszystkie pozycje domu naraz, nie tylko wybranej listy - w rodzinie
 * jest ich najwyżej kilkadziesiąt, a dzięki temu każda lista pokazuje licznik
 * i jedno odświeżenie wystarcza na wszystko.
 */
export function useZakupy(onBlad: (tekst: string) => void) {
  const [listy, setListy] = useState<Lista[]>([])
  const [pozycje, setPozycje] = useState<Pozycja[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  const wczytaj = useCallback(async () => {
    const { data: daneList, error: bladList } = await supabase
      .from('shopping_lists')
      .select('*')
      .order('created_at')

    if (bladList) {
      onBlad(`Nie udało się wczytać list zakupów: ${bladList.message}`)
      return
    }

    const { data: danePozycji, error: bladPozycji } = await supabase
      .from('shopping_items')
      .select('*')
      .order('created_at')

    if (bladPozycji) {
      onBlad(`Nie udało się wczytać pozycji: ${bladPozycji.message}`)
      return
    }

    setListy((daneList ?? []).map(listaZBazy))
    setPozycje((danePozycji ?? []).map(pozycjaZBazy))
  }, [onBlad])

  // Pierwsze wejście: dom bez list dostaje trzy domyślne.
  useEffect(() => {
    let aktualne = true

    void (async () => {
      const { error } = await supabase.rpc('zapewnij_listy_zakupow')
      if (error) onBlad(`Nie udało się przygotować list: ${error.message}`)

      if (!aktualne) return
      await wczytaj()
      if (aktualne) setLadowanie(false)
    })()

    return () => {
      aktualne = false
    }
  }, [wczytaj, onBlad])

  // Kanał otwieramy raz i trzymamy przez całe życie ekranu. Gdyby zależał od
  // `wczytaj`, każda zmiana danych zrywałaby i odtwarzała połączenie.
  const wczytajRef = useRef(wczytaj)
  useEffect(() => {
    wczytajRef.current = wczytaj
  }, [wczytaj])

  useEffect(() => {
    const kanal = supabase
      .channel('zakupy-na-zywo')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items' },
        () => void wczytajRef.current(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_lists' },
        () => void wczytajRef.current(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(kanal)
    }
  }, [])

  const dodajPozycje = useCallback(
    async (listaId: string, nazwa: string, ilosc: string): Promise<boolean> => {
      const { error } = await supabase.from('shopping_items').insert({
        list_id: listaId,
        name: nazwa,
        quantity: ilosc || null,
      })

      if (error) {
        onBlad(`Nie udało się dopisać pozycji: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  /** Odhaczenie zapisujemy optymistycznie - w sklepie nie ma czasu na czekanie. */
  const przelacz = useCallback(
    async (pozycja: Pozycja) => {
      const kopia = pozycje
      setPozycje((stare) =>
        stare.map((p) => (p.id === pozycja.id ? { ...p, kupione: !p.kupione } : p)),
      )

      const { error } = await supabase
        .from('shopping_items')
        .update({ done: !pozycja.kupione })
        .eq('id', pozycja.id)

      if (error) {
        setPozycje(kopia)
        onBlad(`Nie udało się odhaczyć pozycji: ${error.message}`)
      }
    },
    [pozycje, onBlad],
  )

  const usunPozycje = useCallback(
    async (pozycja: Pozycja) => {
      const kopia = pozycje
      setPozycje((stare) => stare.filter((p) => p.id !== pozycja.id))

      const { error } = await supabase.from('shopping_items').delete().eq('id', pozycja.id)
      if (error) {
        setPozycje(kopia)
        onBlad(`Nie udało się usunąć pozycji: ${error.message}`)
      }
    },
    [pozycje, onBlad],
  )

  const wyczyscOdhaczone = useCallback(
    async (listaId: string) => {
      const kopia = pozycje
      setPozycje((stare) => stare.filter((p) => p.listaId !== listaId || !p.kupione))

      const { error } = await supabase
        .from('shopping_items')
        .delete()
        .eq('list_id', listaId)
        .eq('done', true)

      if (error) {
        setPozycje(kopia)
        onBlad(`Nie udało się wyczyścić odhaczonych: ${error.message}`)
      }
    },
    [pozycje, onBlad],
  )

  const dodajListe = useCallback(
    async (nazwa: string): Promise<boolean> => {
      const { error } = await supabase.from('shopping_lists').insert({ name: nazwa })
      if (error) {
        onBlad(`Nie udało się dodać listy: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  const usunListe = useCallback(
    async (listaId: string) => {
      const { error } = await supabase.from('shopping_lists').delete().eq('id', listaId)
      if (error) {
        onBlad(`Nie udało się usunąć listy: ${error.message}`)
        return
      }
      await wczytaj()
    },
    [wczytaj, onBlad],
  )

  return {
    listy,
    pozycje,
    ladowanie,
    dodajPozycje,
    przelacz,
    usunPozycje,
    wyczyscOdhaczone,
    dodajListe,
    usunListe,
  }
}
