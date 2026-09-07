import { useState } from 'react'
import { zaloguj } from './useSesja'

/**
 * Ekran logowania. Konta zakłada się bezpośrednio w bazie Supabase, więc tu
 * jest tylko logowanie - bez rejestracji i bez odzyskiwania hasła.
 */
export function Logowanie() {
  const [email, setEmail] = useState('')
  const [haslo, setHaslo] = useState('')
  const [blad, setBlad] = useState<string | null>(null)
  const [trwa, setTrwa] = useState(false)

  async function wyslij(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !haslo) return

    setTrwa(true)
    setBlad(null)
    const problem = await zaloguj(email, haslo)

    if (problem) {
      setBlad(problem)
      setTrwa(false) // przy powodzeniu komponent i tak zniknie
    }
  }

  return (
    <div className="brama">
      <div className="brama-karta">
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
            autoComplete="current-password"
            value={haslo}
            onChange={(e) => setHaslo(e.target.value)}
          />

          <button type="submit" disabled={trwa || !email.trim() || !haslo}>
            {trwa ? 'Loguję…' : 'Zaloguj się'}
          </button>
        </form>
      </div>
    </div>
  )
}
