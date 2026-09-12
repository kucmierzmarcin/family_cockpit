import { useCallback, useEffect, useState } from 'react'
import { supabase, type TerminDb, type ZalacznikDb } from './lib/supabase'
import { useNaZywo } from './useNaZywo'
import type { Termin, Zalacznik } from './terminy'

const BUCKET = 'deadline-attachments'
const WAZNOSC_LINKU_S = 60

function zalacznikZBazy(z: ZalacznikDb): Zalacznik {
  return {
    id: z.id,
    nazwaPliku: z.file_name,
    sciezka: z.storage_path,
    typ: z.content_type,
    rozmiar: z.size_bytes,
    autorId: z.created_by,
  }
}

function terminZBazy(t: TerminDb, zalaczniki: Zalacznik[]): Termin {
  return {
    id: t.id,
    tytul: t.title,
    opis: t.description,
    termin: t.due_date,
    zalatwiony: t.completed,
    autorId: t.created_by,
    dodano: t.created_at,
    zalaczniki,
  }
}

/** Ważne terminy domu i ich załączniki, odświeżane na żywo. */
export function useTerminy(householdId: string, onBlad: (tekst: string) => void) {
  const [terminy, setTerminy] = useState<Termin[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  const wczytaj = useCallback(async () => {
    const { data: daneTerminow, error: bladTerminow } = await supabase
      .from('deadlines')
      .select('*')
      .order('due_date')

    if (bladTerminow) {
      onBlad(`Nie udało się wczytać terminów: ${bladTerminow.message}`)
      return
    }

    const { data: daneZalacznikow, error: bladZalacznikow } = await supabase
      .from('deadline_attachments')
      .select('*')
      .order('created_at')

    if (bladZalacznikow) {
      onBlad(`Nie udało się wczytać załączników: ${bladZalacznikow.message}`)
      return
    }

    const zalacznikiPoTerminie = new Map<string, Zalacznik[]>()
    for (const z of (daneZalacznikow ?? []) as ZalacznikDb[]) {
      const lista = zalacznikiPoTerminie.get(z.deadline_id) ?? []
      lista.push(zalacznikZBazy(z))
      zalacznikiPoTerminie.set(z.deadline_id, lista)
    }

    setTerminy(
      ((daneTerminow ?? []) as TerminDb[]).map((t) =>
        terminZBazy(t, zalacznikiPoTerminie.get(t.id) ?? []),
      ),
    )
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

  useNaZywo('terminy-na-zywo', ['deadlines', 'deadline_attachments'], () => void wczytaj())

  const dodaj = useCallback(
    async (tytul: string, opis: string, dataTerminu: string): Promise<string | null> => {
      const { data, error } = await supabase
        .from('deadlines')
        .insert({ title: tytul, description: opis || null, due_date: dataTerminu })
        .select('id')
        .single()

      if (error) {
        onBlad(`Nie udało się dodać terminu: ${error.message}`)
        return null
      }
      await wczytaj()
      return data.id as string
    },
    [wczytaj, onBlad],
  )

  /** Odhaczenie zapisujemy optymistycznie - to porzadkowanie, ma reagowac od razu. */
  const przelaczZalatwiony = useCallback(
    async (termin: Termin) => {
      const kopia = terminy
      const nowyStan = !termin.zalatwiony
      setTerminy((stare) => stare.map((t) => (t.id === termin.id ? { ...t, zalatwiony: nowyStan } : t)))

      const { error } = await supabase
        .from('deadlines')
        .update({ completed: nowyStan, completed_at: nowyStan ? new Date().toISOString() : null })
        .eq('id', termin.id)

      if (error) {
        setTerminy(kopia)
        onBlad(`Nie udało się zaktualizować terminu: ${error.message}`)
      }
    },
    [terminy, onBlad],
  )

  /** Kasuje pliki w Storage PRZED wierszem w bazie - po skasowaniu wiersza
   * traci sie liste storage_path do posprzatania. */
  const usunTermin = useCallback(
    async (termin: Termin) => {
      if (termin.zalaczniki.length > 0) {
        const { error: bladStorage } = await supabase.storage
          .from(BUCKET)
          .remove(termin.zalaczniki.map((z) => z.sciezka))
        if (bladStorage) {
          onBlad(`Nie udało się usunąć załączników: ${bladStorage.message}`)
          return
        }
      }

      const kopia = terminy
      setTerminy((stare) => stare.filter((t) => t.id !== termin.id))

      const { error } = await supabase.from('deadlines').delete().eq('id', termin.id)
      if (error) {
        setTerminy(kopia)
        onBlad(`Nie udało się usunąć terminu: ${error.message}`)
      }
    },
    [terminy, onBlad],
  )

  const wgrajZalacznik = useCallback(
    async (terminId: string, plik: File) => {
      const sciezka = `${householdId}/${terminId}/${crypto.randomUUID()}-${plik.name}`
      const { error: bladUploadu } = await supabase.storage
        .from(BUCKET)
        .upload(sciezka, plik, { contentType: plik.type })

      if (bladUploadu) {
        onBlad(`Nie udało się wgrać pliku: ${bladUploadu.message}`)
        return
      }

      const { error: bladZapisu } = await supabase.from('deadline_attachments').insert({
        deadline_id: terminId,
        storage_path: sciezka,
        file_name: plik.name,
        content_type: plik.type,
        size_bytes: plik.size,
      })

      if (bladZapisu) {
        onBlad(`Nie udało się zapisać załącznika: ${bladZapisu.message}`)
        await supabase.storage.from(BUCKET).remove([sciezka])
        return
      }
      await wczytaj()
    },
    [householdId, wczytaj, onBlad],
  )

  const usunZalacznik = useCallback(
    async (zalacznik: Zalacznik) => {
      const { error: bladStorage } = await supabase.storage.from(BUCKET).remove([zalacznik.sciezka])
      if (bladStorage) {
        onBlad(`Nie udało się usunąć pliku: ${bladStorage.message}`)
        return
      }

      const { error } = await supabase.from('deadline_attachments').delete().eq('id', zalacznik.id)
      if (error) {
        onBlad(`Nie udało się usunąć załącznika: ${error.message}`)
        return
      }
      await wczytaj()
    },
    [wczytaj, onBlad],
  )

  const linkDoZalacznika = useCallback(
    async (zalacznik: Zalacznik): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(zalacznik.sciezka, WAZNOSC_LINKU_S)

      if (error) {
        onBlad(`Nie udało się otworzyć pliku: ${error.message}`)
        return null
      }
      return data.signedUrl
    },
    [onBlad],
  )

  return {
    terminy,
    ladowanie,
    dodaj,
    przelaczZalatwiony,
    usunTermin,
    wgrajZalacznik,
    usunZalacznik,
    linkDoZalacznika,
  }
}
