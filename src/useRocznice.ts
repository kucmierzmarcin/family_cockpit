import { useCallback, useEffect, useState } from 'react'
import { supabase, type RocznicaDb } from './lib/supabase'
import { useNaZywo } from './useNaZywo'
import type { Rocznica, TypRocznicy } from './rocznice'

function rocznicaZBazy(r: RocznicaDb): Rocznica {
  return {
    id: r.id,
    tytul: r.tytul,
    typ: r.typ as TypRocznicy,
    dzien: r.dzien,
    miesiac: r.miesiac,
    rok: r.rok,
    autorId: r.created_by,
  }
}

/** Ważne rocznice domu (urodziny, imieniny, rocznice), odświeżane na żywo. */
export function useRocznice(onBlad: (tekst: string) => void) {
  const [rocznice, setRocznice] = useState<Rocznica[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  const wczytaj = useCallback(async () => {
    const { data, error } = await supabase.from('rocznice').select('*').order('miesiac').order('dzien')
    if (error) {
      onBlad(`Nie udało się wczytać rocznic: ${error.message}`)
      return
    }
    setRocznice(((data ?? []) as RocznicaDb[]).map(rocznicaZBazy))
  }, [onBlad])

  useEffect(() => {
    let aktualne = true
    void (async () => {
      await wczytaj()
      if (aktualne) setLadowanie(false)
    })()
    return () => {
      aktualne = false
    }
  }, [wczytaj])

  useNaZywo('rocznice-na-zywo', ['rocznice'], () => void wczytaj())

  const dodaj = useCallback(
    async (
      tytul: string,
      typ: TypRocznicy,
      dzien: number,
      miesiac: number,
      rok: number | null,
    ): Promise<boolean> => {
      const { error } = await supabase.from('rocznice').insert({ tytul, typ, dzien, miesiac, rok })
      if (error) {
        onBlad(`Nie udało się dodać rocznicy: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  const edytuj = useCallback(
    async (
      id: string,
      tytul: string,
      typ: TypRocznicy,
      dzien: number,
      miesiac: number,
      rok: number | null,
    ): Promise<boolean> => {
      const { error } = await supabase
        .from('rocznice')
        .update({ tytul, typ, dzien, miesiac, rok })
        .eq('id', id)
      if (error) {
        onBlad(`Nie udało się zapisać zmian: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  const usun = useCallback(
    async (id: string): Promise<boolean> => {
      const { error } = await supabase.from('rocznice').delete().eq('id', id)
      if (error) {
        onBlad(`Nie udało się usunąć rocznicy: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  return { rocznice, ladowanie, dodaj, edytuj, usun }
}
