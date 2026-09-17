import { useCallback, useEffect, useState } from 'react'
import { supabase, type PaczkaDb } from './lib/supabase'
import { useNaZywo } from './useNaZywo'
import { paczkaZBazy, posortujPaczki, type Paczka } from './paczki'
// Typ powstał w Tasku 4 razem ze swoim pierwszym konsumentem.
import type { StatusInpost } from './uklad/ParowanieInpost'

/** Jeden wiersz z `status_polaczenia_inpost()` - patrz supabase/schema.sql. */
type WierszPolaczeniaInpost = {
  member_id: string
  imie: string
  phone: string
  status: StatusInpost['status']
  ostatni_blad: string | null
}

/** Paczki InPost i stan połączeń domowników, odświeżane na żywo. */
export function useInpost(onBlad: (tekst: string) => void) {
  const [paczki, setPaczki] = useState<Paczka[]>([])
  const [polaczenia, setPolaczenia] = useState<StatusInpost[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  const pobierz = useCallback(async () => {
    const [
      { data: wiersze, error: bladPaczek },
      { data: stan, error: bladPolaczen },
    ] = await Promise.all([
      supabase.from('inpost_parcels').select('*'),
      supabase.rpc('status_polaczenia_inpost'),
    ])

    // Obie zapytania traktujemy niezależnie (jak w useVulcan.ts) - błąd jednego
    // nie może zablokować drugiego ani zawiesić ekranu w stanie ładowania.
    if (bladPaczek) {
      onBlad(`Nie udało się wczytać paczek: ${bladPaczek.message}`)
    } else {
      setPaczki(posortujPaczki(((wiersze ?? []) as PaczkaDb[]).map(paczkaZBazy)))
    }

    if (bladPolaczen) {
      onBlad(`Nie udało się wczytać stanu połączenia z InPostem: ${bladPolaczen.message}`)
    } else {
      setPolaczenia(
        ((stan ?? []) as WierszPolaczeniaInpost[]).map((s) => ({
          memberId: s.member_id,
          imie: s.imie,
          phone: s.phone,
          status: s.status,
          ostatniBlad: s.ostatni_blad,
        })),
      )
    }
  }, [onBlad])

  useEffect(() => {
    let aktualne = true
    void (async () => {
      await pobierz()
      if (aktualne) setLadowanie(false)
    })()
    return () => {
      aktualne = false
    }
  }, [pobierz])

  useNaZywo('inpost-na-zywo', ['inpost_parcels'], pobierz)

  const odswiez = useCallback(async () => {
    const { error } = await supabase.functions.invoke('inpost-sync')
    if (error) onBlad('Nie udało się odświeżyć paczek.')
    else await pobierz()
  }, [onBlad, pobierz])

  return { paczki, polaczenia, ladowanie, odswiez }
}
