import { useState } from 'react'
import { zaloguj, zarejestruj } from './useSesja'

type Tryb = 'logowanie' | 'rejestracja'

/**
 * Ekran wejściowy: logowanie albo zakładanie konta. Bez odzyskiwania hasła -
 * hasło resetuje rodzic w panelu Supabase.
 */
export function Logowanie() {
  const [tryb, setTryb] = useState<Tryb>('logowanie')
  const [email, setEmail] = useState('')
  const [haslo, setHaslo] = useState('')
  const [blad, setBlad] = useState<string | null>(null)
  const [trwa, setTrwa] = useState(false)

  const rejestracja = tryb === 'rejestracja'

  function przelacz(nowy: Tryb) {
    setTryb(nowy)
    setBlad(null)
  }

  async function wyslij(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !haslo) return

    setTrwa(true)
    setBlad(null)
    const problem = rejestracja
      ? await zarejestruj(email, haslo)
      : await zaloguj(email, haslo)

    if (problem) {
      setBlad(problem)
      setTrwa(false) // przy powodzeniu komponent i tak zniknie
    }
  }

  return (
    <div className="brama">
      <div className="brama-karta">
        <h1>Kokpit Rodzinny</h1>
        <p className="podtytul">
          {rejestracja
            ? 'Załóż konto, żeby dołączyć do rodziny albo utworzyć własny dom.'
            : 'Zaloguj się, żeby zobaczyć kalendarz rodziny.'}
        </p>

        <div className="zakladki rowne" role="group" aria-label="Logowanie albo zakładanie konta">
          <button
            type="button"
            className={`zakladka${!rejestracja ? ' aktywna' : ''}`}
            aria-pressed={!rejestracja}
            onClick={() => przelacz('logowanie')}
          >
            Mam konto
          </button>
          <button
            type="button"
            className={`zakladka${rejestracja ? ' aktywna' : ''}`}
            aria-pressed={rejestracja}
            onClick={() => przelacz('rejestracja')}
          >
            Załóż konto
          </button>
        </div>

        {blad && (
          <p className="blad" role="alert">
            {blad}
          </p>
        )}

        <form className="formularz" onSubmit={(e) => void wyslij(e)}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="np. ania@example.com"
          />

          <label htmlFor="haslo">Hasło</label>
          <input
            id="haslo"
            type="password"
            autoComplete={rejestracja ? 'new-password' : 'current-password'}
            value={haslo}
            onChange={(e) => setHaslo(e.target.value)}
          />
          {rejestracja && <span className="wskazowka">Co najmniej 6 znaków.</span>}

          <button type="submit" disabled={trwa || !email.trim() || !haslo}>
            {trwa
              ? rejestracja
                ? 'Zakładam…'
                : 'Loguję…'
              : rejestracja
                ? 'Załóż konto'
                : 'Zaloguj się'}
          </button>
        </form>

        <p className="brama-stopka">
          {rejestracja
            ? 'Jeśli rodzic wpisał już Twój adres przy osobie w domu, po założeniu konta trafisz tam od razu.'
            : 'Nie masz konta? Przełącz się na „Załóż konto”.'}
        </p>
      </div>
    </div>
  )
}
