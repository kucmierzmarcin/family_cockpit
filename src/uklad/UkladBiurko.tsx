import type { ReactNode } from 'react'
import type { DomownikDb } from '../lib/supabase'
import { kolor } from '../kolory'
import { wyloguj } from '../auth/useSesja'
import { EKRANY, TYTULY, type Ekran } from './nawigacja'

type Props = {
  profil: DomownikDb
  email: string
  ekran: Ekran
  onEkran: (e: Ekran) => void
  /** Widok dnia/tygodnia na szerokim ekranie: wypełnij okno, bez przewijania strony. */
  pelnyEkran?: boolean
  children: ReactNode
}

/** Rama na komputerze: nagłówek z zakładkami u góry i kontem po prawej. */
export function UkladBiurko({ profil, email, ekran, onEkran, pelnyEkran, children }: Props) {
  return (
    <div className={`kokpit${pelnyEkran ? ' kokpit-pelny' : ''}`}>
      <header className="naglowek">
        <div className="pasek">
          <nav className="zakladki" aria-label="Ekran">
            {EKRANY.map((e) => (
              <button
                key={e}
                type="button"
                className={`zakladka${ekran === e ? ' aktywna' : ''}`}
                aria-current={ekran === e ? 'page' : undefined}
                onClick={() => onEkran(e)}
              >
                {TYTULY[e]}
              </button>
            ))}
          </nav>

          <div className="konto">
            <span className="konto-kto">
              <span
                className="kropka"
                style={{ background: kolor(profil.color).kropka }}
                aria-hidden="true"
              />
              {profil.name}
              <span className="meta">{email}</span>
            </span>
            <button type="button" className="drobny" onClick={() => void wyloguj()}>
              Wyloguj
            </button>
          </div>
        </div>
      </header>

      {children}
    </div>
  )
}
