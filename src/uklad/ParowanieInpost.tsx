import { useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

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
  const { polaczenie, onOdswiez } = inpost
  const [etap, setEtap] = useState<'numer' | 'kod'>('numer')
  const [phone, setPhone] = useState('')
  const [kod, setKod] = useState('')
  const [blad, setBlad] = useState<string | null>(null)
  const [zapisywanie, setZapisywanie] = useState(false)

  async function wyslij(e: React.FormEvent, krok: 'sms' | 'potwierdz') {
    e.preventDefault()
    setZapisywanie(true)
    setBlad(null)
    const { error } = await supabase.functions.invoke('inpost-polacz', {
      body: krok === 'sms' ? { krok, phone } : { krok, phone, kod },
    })
    setZapisywanie(false)

    if (error) {
      setBlad(await komunikatBledu(error))
      return
    }

    if (krok === 'sms') {
      setEtap('kod')
    } else {
      setKod('')
      setPhone('')
      setEtap('numer')
      onOdswiez()
    }
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
        <form className="formularz" onSubmit={(e) => void wyslij(e, 'sms')}>
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
        <form className="formularz" onSubmit={(e) => void wyslij(e, 'potwierdz')}>
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
