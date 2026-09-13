import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { LekcjaDb, WiadomoscDb, WpisDb } from './lib/supabase'
import { useNaZywo } from './useNaZywo'
import {
  lekcjaZBazy,
  wiadomoscZBazy,
  wpisZBazy,
  type Lekcja,
  type StatusPolaczenia,
  type Wiadomosc,
  type Wpis,
} from './vulcan'

type WierszStatusu = {
  istnieje: boolean
  status: StatusPolaczenia['status']
  sync_hours: string[]
  polaczyl: string | null
  ostatni_blad: string | null
  uczniowie: Array<{ id: string; imie: string; nazwisko: string; klasa: string | null; memberId: string | null }>
}

async function komunikatBledu(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const cialo = await error.context.json()
      if (typeof cialo?.blad === 'string') return cialo.blad
    } catch {
      // odpowiedź błędu nie była JSON-em - zostajemy przy komunikacie domyślnym
    }
  }
  return error instanceof Error ? error.message : String(error)
}

/** Integracja z Vulcan: status połączenia + dane szkolne domu, odświeżane na żywo. */
export function useVulcan(onBlad: (tekst: string) => void) {
  const [status, setStatus] = useState<StatusPolaczenia | null>(null)
  const [lekcje, setLekcje] = useState<Lekcja[]>([])
  const [wpisy, setWpisy] = useState<Wpis[]>([])
  const [wiadomosci, setWiadomosci] = useState<Wiadomosc[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  const wczytaj = useCallback(async () => {
    const { data: daneStatusu, error: bladStatusu } = await supabase.rpc('status_polaczenia_vulcan')
    if (bladStatusu) {
      onBlad(`Nie udało się wczytać statusu Vulcan: ${bladStatusu.message}`)
      return
    }
    const wiersz = (daneStatusu as WierszStatusu[])[0]
    setStatus(
      wiersz
        ? {
            istnieje: wiersz.istnieje,
            status: wiersz.status,
            godzinySync: wiersz.sync_hours,
            polaczylImie: wiersz.polaczyl,
            ostatniBlad: wiersz.ostatni_blad,
            uczniowie: wiersz.uczniowie.map((u) => ({
              id: u.id,
              imie: u.imie,
              nazwisko: u.nazwisko,
              klasa: u.klasa,
              memberId: u.memberId,
            })),
          }
        : null,
    )

    const [{ data: daneLekcji, error: bladLekcji }, { data: daneWpisow, error: bladWpisow },
      { data: daneWiadomosci, error: bladWiadomosci }] = await Promise.all([
      supabase.from('vulcan_lessons').select('*'),
      supabase.from('vulcan_assignments').select('*'),
      supabase.from('vulcan_messages').select('*'),
    ])

    if (bladLekcji) onBlad(`Nie udało się wczytać planu lekcji: ${bladLekcji.message}`)
    else setLekcje(((daneLekcji ?? []) as LekcjaDb[]).map(lekcjaZBazy))

    if (bladWpisow) onBlad(`Nie udało się wczytać sprawdzianów/zadań: ${bladWpisow.message}`)
    else setWpisy(((daneWpisow ?? []) as WpisDb[]).map(wpisZBazy))

    if (bladWiadomosci) onBlad(`Nie udało się wczytać wiadomości: ${bladWiadomosci.message}`)
    else setWiadomosci(((daneWiadomosci ?? []) as WiadomoscDb[]).map(wiadomoscZBazy))
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

  useNaZywo(
    'vulcan-na-zywo',
    ['vulcan_students', 'vulcan_lessons', 'vulcan_assignments', 'vulcan_messages'],
    () => void wczytaj(),
  )

  const polacz = useCallback(
    async (token: string, symbol: string, pin: string): Promise<boolean> => {
      const { error } = await supabase.functions.invoke('vulcan-polacz', { body: { token, symbol, pin } })
      if (error) {
        onBlad(`Nie udało się połączyć z Vulcan: ${await komunikatBledu(error)}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  const rozlacz = useCallback(async (): Promise<boolean> => {
    const { error } = await supabase.rpc('rozlacz_vulcan')
    if (error) {
      onBlad(`Nie udało się rozłączyć: ${error.message}`)
      return false
    }
    await wczytaj()
    return true
  }, [wczytaj, onBlad])

  const ustawGodzinySync = useCallback(
    async (godziny: string[]): Promise<boolean> => {
      const { error } = await supabase.rpc('ustaw_godziny_sync_vulcan', { p_godziny: godziny })
      if (error) {
        onBlad(`Nie udało się zapisać godzin: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  const odswiezTeraz = useCallback(async (): Promise<boolean> => {
    const { error } = await supabase.functions.invoke('vulcan-sync', { body: {} })
    if (error) {
      onBlad(`Odświeżanie nie powiodło się: ${await komunikatBledu(error)}`)
      return false
    }
    await wczytaj()
    return true
  }, [wczytaj, onBlad])

  const przypiszUcznia = useCallback(
    async (uczenId: string, memberId: string | null): Promise<boolean> => {
      const { error } = await supabase.rpc('przypisz_ucznia_vulcan', { p_uczen: uczenId, p_member: memberId })
      if (error) {
        onBlad(`Nie udało się przypisać ucznia: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  return {
    status,
    lekcje,
    wpisy,
    wiadomosci,
    ladowanie,
    polacz,
    rozlacz,
    ustawGodzinySync,
    odswiezTeraz,
    przypiszUcznia,
  }
}
