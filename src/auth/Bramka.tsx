import { useCallback, useEffect, useState } from 'react'
import { supabase, type DomownikDb } from '../lib/supabase'
import { useSesja, wyloguj } from './useSesja'
import { Logowanie } from './Logowanie'
import App from '../App'

type Stan =
  | { etap: 'sprawdzam' }
  | { etap: 'gotowe'; profil: DomownikDb }
  | { etap: 'bez-domu' }
  | { etap: 'blad'; tekst: string }

/**
 * Wpuszcza do aplikacji. Kolejno: czeka na sesję, próbuje powiązać konto
 * z osobą w domu, pobiera profil zalogowanego. Kalendarz dostaje gotowy
 * profil, więc nie musi wiedzieć nic o logowaniu.
 */
export function Bramka() {
  const { sesja, sprawdzone } = useSesja()
  const [stan, setStan] = useState<Stan>({ etap: 'sprawdzam' })

  const wczytajProfil = useCallback(async (userId: string): Promise<Stan> => {
    // Konto mogło powstać zanim rodzic wpisał adres przy osobie (albo odwrotnie),
    // więc przy każdym wejściu próbujemy je dopiąć. Wywołanie jest nieszkodliwe,
    // gdy powiązanie już istnieje.
    const { error: bladLaczenia } = await supabase.rpc('polacz_moje_konto')
    if (bladLaczenia) {
      return { etap: 'blad', tekst: `Nie udało się sprawdzić konta: ${bladLaczenia.message}` }
    }

    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      return { etap: 'blad', tekst: `Nie udało się wczytać profilu: ${error.message}` }
    }
    return data ? { etap: 'gotowe', profil: data } : { etap: 'bez-domu' }
  }, [])

  const odswiez = useCallback(async () => {
    if (!sesja) return
    setStan(await wczytajProfil(sesja.user.id))
  }, [sesja, wczytajProfil])

  useEffect(() => {
    if (!sesja) return

    let aktualne = true
    void (async () => {
      const wynik = await wczytajProfil(sesja.user.id)
      if (aktualne) setStan(wynik)
    })()

    return () => {
      aktualne = false
    }
  }, [sesja, wczytajProfil])

  if (!sprawdzone) return <Ladowanie />
  if (!sesja) return <Logowanie />

  if (stan.etap === 'sprawdzam') return <Ladowanie />

  if (stan.etap === 'gotowe') {
    return <App profil={stan.profil} email={sesja.user.email ?? ''} />
  }

  if (stan.etap === 'bez-domu') {
    return <ZalozDom email={sesja.user.email ?? ''} onGotowe={() => void odswiez()} />
  }

  return (
    <div className="brama">
      <div className="brama-karta">
        <h1>Coś poszło nie tak</h1>
        <p className="podtytul">{stan.tekst}</p>
        <form className="formularz">
          <button type="button" onClick={() => void wyloguj()}>
            Wyloguj się
          </button>
        </form>
      </div>
    </div>
  )
}

type ZalozDomProps = {
  email: string
  onGotowe: () => void
}

/**
 * Konto istnieje, ale nie należy do żadnego domu. Albo rodzic jeszcze nie wpisał
 * tego adresu przy osobie, albo to pierwsza osoba w tej rodzinie.
 */
function ZalozDom({ email, onGotowe }: ZalozDomProps) {
  const [nazwa, setNazwa] = useState('Nasz dom')
  const [imie, setImie] = useState('')
  const [blad, setBlad] = useState<string | null>(null)
  const [trwa, setTrwa] = useState(false)

  async function wyslij(e: React.FormEvent) {
    e.preventDefault()
    if (!imie.trim()) return

    setTrwa(true)
    setBlad(null)
    const { error } = await supabase.rpc('zaloz_dom', {
      nazwa: nazwa.trim(),
      imie: imie.trim(),
    })

    if (error) {
      setBlad(`Nie udało się założyć domu: ${error.message}`)
      setTrwa(false)
      return
    }
    onGotowe()
  }

  return (
    <div className="brama">
      <div className="brama-karta">
        <h1>Nie masz jeszcze domu</h1>
        <p className="podtytul">
          Konto <b>{email}</b> nie jest przypisane do żadnego domownika.
          Jeśli ktoś z rodziny już założył dom, poproś go, żeby wpisał ten adres
          przy Twojej osobie na ekranie „Mój dom”. A jeśli zaczynasz — załóż dom tutaj.
        </p>

        {blad && (
          <p className="blad" role="alert">
            {blad}
          </p>
        )}

        <form className="formularz" onSubmit={(e) => void wyslij(e)}>
          <label htmlFor="imie-domu">Twoje imię</label>
          <input
            id="imie-domu"
            value={imie}
            onChange={(e) => setImie(e.target.value)}
            placeholder="np. Marcin"
            maxLength={40}
          />

          <label htmlFor="nazwa-domu">Nazwa domu</label>
          <input
            id="nazwa-domu"
            value={nazwa}
            onChange={(e) => setNazwa(e.target.value)}
            placeholder="np. Nasz dom"
            maxLength={60}
          />

          <button type="submit" disabled={trwa || !imie.trim()}>
            {trwa ? 'Zakładam…' : 'Załóż własny dom'}
          </button>
          <button type="button" className="drugi" onClick={() => void wyloguj()}>
            Wyloguj się
          </button>
        </form>

        <p className="brama-stopka">Zostaniesz w tym domu rodzicem.</p>
      </div>
    </div>
  )
}

function Ladowanie() {
  return (
    <div className="brama">
      <p className="podtytul">Wczytuję…</p>
    </div>
  )
}
