import { useCallback, useEffect, useState } from 'react'
import { supabase, type NotatkaDb } from './lib/supabase'
import { useNaZywo } from './useNaZywo'
import type { Notatka } from './notatki'

function zBazy(n: NotatkaDb): Notatka {
  return {
    id: n.id,
    tresc: n.content,
    przypieta: n.pinned,
    autorId: n.created_by,
    // `created_at` to timestamptz, więc tu strefa jest w porządku - inaczej niż
    // przy wydarzeniach, gdzie celowo trzymamy czas bez strefy.
    dodano: new Date(n.created_at),
  }
}

/** Notatki tablicy rodzinnej, odświeżane na żywo. */
export function useTablica(onBlad: (tekst: string) => void) {
  const [notatki, setNotatki] = useState<Notatka[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  const wczytaj = useCallback(async () => {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      onBlad(`Nie udało się wczytać tablicy: ${error.message}`)
      return
    }
    setNotatki((data ?? []).map(zBazy))
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

  useNaZywo('tablica-na-zywo', ['notes'], () => void wczytaj())

  const dodaj = useCallback(
    async (tresc: string): Promise<boolean> => {
      const { error } = await supabase.from('notes').insert({ content: tresc })
      if (error) {
        onBlad(`Nie udało się dodać notatki: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  /** Przypięcie zapisujemy optymistycznie - karteczka przeskakuje od razu. */
  const przypnij = useCallback(
    async (notatka: Notatka) => {
      const kopia = notatki
      setNotatki((stare) =>
        stare.map((n) => (n.id === notatka.id ? { ...n, przypieta: !n.przypieta } : n)),
      )

      const { error } = await supabase
        .from('notes')
        .update({ pinned: !notatka.przypieta })
        .eq('id', notatka.id)

      if (error) {
        setNotatki(kopia)
        onBlad(`Nie udało się przypiąć notatki: ${error.message}`)
      }
    },
    [notatki, onBlad],
  )

  const usun = useCallback(
    async (notatka: Notatka) => {
      const kopia = notatki
      setNotatki((stare) => stare.filter((n) => n.id !== notatka.id))

      const { error } = await supabase.from('notes').delete().eq('id', notatka.id)
      if (error) {
        setNotatki(kopia)
        onBlad(`Nie udało się usunąć notatki: ${error.message}`)
      }
    },
    [notatki, onBlad],
  )

  return { notatki, ladowanie, dodaj, przypnij, usun }
}
