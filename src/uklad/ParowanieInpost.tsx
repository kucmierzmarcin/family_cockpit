import { useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
// Ten sam, przetestowany kształt ciała, którego używa funkcja brzegowa.
// Moduł jest czysty (zero importów z Deno), więc wolno go wciągnąć do strony -
// i lepiej go wciągnąć, niż powielić: rozjazd tych dwóch kształtów to
// dokładnie ten błąd, który wywalał parowanie (HTTP 500 z pustym ciałem).
import { cialoWyslaniaKodu } from '../../supabase/functions/_wspolne/inpostApi'

/**
 * Stan połączenia z InPostem, tak jak zwraca go `status_polaczenia_inpost()`.
 *
 * Typ mieszka tutaj, a nie w `useInpost`, bo ten komponent jest jego pierwszym
 * konsumentem i powstaje wcześniej. Hak zaimportuje go stąd - ten sam układ co
 * `Widok` eksportowany z `SterowanieKalendarza.tsx` i używany przez `trasa.ts`.
 */
export type StatusInpost = {
  memberId: string
  imie: string
  phone: string
  status: 'aktywne' | 'wymaga_ponownego_logowania'
  ostatniBlad: string | null
}

type Props = {
  inpost: {
    /** Połączenie tego domownika albo `null`, gdy jeszcze nie sparował numeru. */
    polaczenie: StatusInpost | null
    onOdswiez: () => void
    onRozlacz: () => Promise<boolean>
  }
}

/**
 * Odpowiedź `FunctionsHttpError` niesie właściwy komunikat w ciele - patrz `useVulcan.ts`/`ImportAI.tsx`.
 *
 * Gdy błąd NIE jest odpowiedzią naszej funkcji, doklejamy `error.message`
 * (wzorem `komunikatBledu` w `useVulcan.ts`) i mówimy, że zawiodło WYWOŁANIE
 * funkcji - nie InPost. Wcześniej stał tu stały napis „Nie udało się połączyć
 * z InPostem", który raz już zmylił: funkcja `inpost-polacz` nie była w ogóle
 * wdrożona, więc preflight CORS dostawał 404 i `invoke` rzucał
 * `FunctionsFetchError` - a aplikacja pokazywała oskarżenie pod adresem
 * InPostu, choć żadne zapytanie do InPostu nawet nie wyszło.
 */
async function komunikatBledu(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const cialo = await error.context.json()
      if (typeof cialo?.blad === 'string') return cialo.blad
    } catch {
      // odpowiedź błędu nie była JSON-em - spada niżej, do komunikatu z `error.message`
    }
  }
  const szczegol = error instanceof Error ? error.message : String(error)
  return `Nie udało się wywołać funkcji parowania: ${szczegol}`
}

/**
 * Dwa kroki parowania w jednym komponencie: numer → SMS → kod.
 *
 * Numer i kod idą wprost do funkcji brzegowej i nigdzie się nie zatrzymują -
 * przeglądarka nie zapisuje ich ani w stanie po zakończeniu, ani w bazie.
 */
export function ParowanieInpost({ inpost }: Props) {
  const { polaczenie, onOdswiez, onRozlacz } = inpost
  const [etap, setEtap] = useState<'numer' | 'kod'>('numer')
  const [phone, setPhone] = useState('')
  const [kod, setKod] = useState('')
  const [blad, setBlad] = useState<string | null>(null)
  const [zapisywanie, setZapisywanie] = useState(false)
  const [rozlaczanie, setRozlaczanie] = useState(false)

  /**
   * Krok 1 - prośba o SMS. NIE idzie przez funkcję brzegową, i NIE idzie
   * przez zwykły `fetch()` Node.js po drugiej stronie proxy - patrz
   * `vite.config.ts`: Cloudflare przed InPostem blokuje to zadanie z Node.js
   * (200 bez realnego skutku), więc serwer deweloperski uruchamia zamiast
   * tego Pythona (`scripts/wyslij_sms_inpost.py`) - żywo potwierdzone
   * dwukrotnie 2026-09-18, patrz pamięć projektu "kokpit-plan-budowy".
   * Przeglądarka nie może zawołać InPostu wprost - preflight CORS dostaje 403
   * - więc i tak musi iść przez serwer deweloperski, tylko realną robotę
   * wykonuje tam Python, nie Node.
   *
   * Bramka logowania Supabase nie ma tu czego chronić - żądanie wychodzi z
   * maszyny domownika, a nie z naszej funkcji. Ale sam formularz przyjmuje
   * DOWOLNY numer, nie tylko własny - bez ograniczenia dałoby to sposób na
   * bombardowanie SMS-ami cudzego numeru. Dlatego proxy w `vite.config.ts`
   * ma własny rate-limiting (`src/inpostLimiter.ts`), niezależny od
   * uwierzytelnienia.
   */
  async function wyslijProsbeOKod(e: React.FormEvent) {
    e.preventDefault()
    setBlad(null)

    if (!import.meta.env.DEV) {
      setBlad('Parowanie z InPostem działa tylko przy aplikacji uruchomionej lokalnie (npm run dev).')
      return
    }

    setZapisywanie(true)
    try {
      const numer = phone.replace(/\D/g, '')
      // `?tel=` powtarza numer z body wyłącznie do odczytu przez rate-limiter
      // proxy (patrz vite.config.ts) - samego żądania do InPostu nie zmienia,
      // `rewrite` proxy ucina go przed przekazaniem dalej.
      const odp = await fetch(`/inpost-api/v1/sendSMSCode?tel=${numer}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(cialoWyslaniaKodu(numer)),
      })
      if (!odp.ok) {
        if (odp.status === 429) {
          try {
            const cialo = await odp.json()
            if (typeof cialo?.blad === 'string') {
              setBlad(cialo.blad)
              return
            }
          } catch {
            // odpowiedź 429 bez JSON-a - spada do ogólnego komunikatu niżej
          }
        }
        setBlad(`InPost odrzucił prośbę o kod (HTTP ${odp.status}).`)
        return
      }
      setEtap('kod')
    } catch (e) {
      setBlad(`Nie udało się wysłać prośby o kod: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setZapisywanie(false)
    }
  }

  /** Krok 2 - potwierdzenie kodu. Zostaje po stronie serwera, żeby tokeny
   *  InPostu trafiły prosto do bazy i nigdy nie przeszły przez przeglądarkę. */
  async function potwierdzKod(e: React.FormEvent) {
    e.preventDefault()
    setZapisywanie(true)
    setBlad(null)
    const { error } = await supabase.functions.invoke('inpost-polacz', {
      body: { phone, kod },
    })
    setZapisywanie(false)

    if (error) {
      setBlad(await komunikatBledu(error))
      return
    }

    setKod('')
    setPhone('')
    setEtap('numer')
    onOdswiez()
  }

  if (polaczenie && polaczenie.status === 'aktywne') {
    return (
      <section className="karta">
        <h2 className="panel-tytul">Paczki InPost</h2>
        <p className="polaczono">Połączono z numerem {polaczenie.phone}</p>
        {/* `ostatni_blad` przy statusie "aktywne" - patrz `synchronizujPolaczenia`
            w `inpost-sync/index.ts`: tylko padnięte ODŚWIEŻENIE TOKENU ustawia
            "wymaga_ponownego_logowania"; każda inna awaria (401/5xx przy
            pobieraniu paczek, nierozpoznany kształt odpowiedzi, nieudany zapis)
            zapisuje `last_error`, ale ZOSTAWIA status "aktywne" - bez tego pokazywalibyśmy
            "Połączono" przy połączeniu, które nie zsynchronizowało się od tygodnia. */}
        {polaczenie.ostatniBlad && (
          <p className="blad" role="alert">
            {polaczenie.ostatniBlad}
          </p>
        )}
        <button
          type="button"
          className="usuwanie"
          disabled={rozlaczanie}
          onClick={async () => {
            setRozlaczanie(true)
            await onRozlacz()
            setRozlaczanie(false)
          }}
        >
          {rozlaczanie ? 'Rozłączam…' : 'Rozłącz'}
        </button>
      </section>
    )
  }

  return (
    <section className="karta">
      <h2 className="panel-tytul">Paczki InPost</h2>

      {polaczenie?.status === 'wymaga_ponownego_logowania' && (
        <p className="blad" role="alert">
          Sesja InPostu wygasła - zaloguj się ponownie kodem SMS.
        </p>
      )}

      {blad && (
        <p className="blad" role="alert">
          {blad}
        </p>
      )}

      {etap === 'numer' ? (
        <form className="formularz" onSubmit={(e) => void wyslijProsbeOKod(e)}>
          <label htmlFor="inpost-telefon">Numer telefonu w InPoście</label>
          <input
            id="inpost-telefon"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="np. 600100200"
            maxLength={15}
          />
          <button type="submit" disabled={zapisywanie || phone.replace(/\D/g, '').length !== 9}>
            {zapisywanie ? 'Wysyłam…' : 'Wyślij kod SMS'}
          </button>
        </form>
      ) : (
        <form className="formularz" onSubmit={(e) => void potwierdzKod(e)}>
          <label htmlFor="inpost-kod">Kod z SMS-a</label>
          <input
            id="inpost-kod"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={kod}
            onChange={(e) => setKod(e.target.value)}
            maxLength={6}
          />
          <button type="submit" disabled={zapisywanie || kod.replace(/\D/g, '').length !== 6}>
            {zapisywanie ? 'Sprawdzam…' : 'Połącz'}
          </button>
          <button
            type="button"
            className="drobny"
            onClick={() => {
              setKod('')
              setEtap('numer')
            }}
          >
            Zmień numer
          </button>
        </form>
      )}
    </section>
  )
}
