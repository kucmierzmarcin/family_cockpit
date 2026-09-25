import { useCallback, useEffect, useState } from 'react'
import { supabase, type OdpadDb } from './lib/supabase'
import { useNaZywo } from './useNaZywo'
import type { RodzajOdpadow, TerminOdbioru } from './odpady'

function terminZBazy(o: OdpadDb): TerminOdbioru {
  return {
    id: o.id,
    rodzaj: o.rodzaj as RodzajOdpadow,
    data: o.data,
    autorId: o.created_by,
  }
}

/** Terminy odbioru odpadow domu, odswiezane na zywo. */
export function useOdpady(onBlad: (tekst: string) => void) {
  const [terminy, setTerminy] = useState<TerminOdbioru[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  const wczytaj = useCallback(async () => {
    const { data, error } = await supabase.from('odpady').select('*').order('data')
    if (error) {
      onBlad(`Nie udało się wczytać terminów odbioru odpadów: ${error.message}`)
      return
    }
    setTerminy(((data ?? []) as OdpadDb[]).map(terminZBazy))
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

  useNaZywo('odpady-na-zywo', ['odpady'], () => void wczytaj())

  const dodaj = useCallback(
    async (rodzaj: RodzajOdpadow, data: string): Promise<boolean> => {
      const { error } = await supabase.from('odpady').insert({ rodzaj, data })
      if (error) {
        onBlad(`Nie udało się dodać terminu odbioru: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  const edytuj = useCallback(
    async (id: string, rodzaj: RodzajOdpadow, data: string): Promise<boolean> => {
      const { error } = await supabase.from('odpady').update({ rodzaj, data }).eq('id', id)
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
      const { error } = await supabase.from('odpady').delete().eq('id', id)
      if (error) {
        onBlad(`Nie udało się usunąć terminu: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  return { terminy, ladowanie, dodaj, edytuj, usun }
}
