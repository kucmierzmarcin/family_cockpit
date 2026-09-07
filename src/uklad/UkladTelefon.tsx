import type { ReactNode } from 'react'
import { EKRANY, TYTULY, etykietaDodania, type Ekran } from './nawigacja'

type Props = {
  ekran: Ekran
  onEkran: (e: Ekran) => void
  jestemRodzicem: boolean
  /** Zawartość górnego paska: sterowanie kalendarza albo nazwa ekranu. */
  gorny: ReactNode
  onDodaj: () => void
  /** Czy arkusz dodawania jest otwarty - „+" jest jego wyzwalaczem. */
  dodawanieOtwarte: boolean
  children: ReactNode
}

/** Rama na telefonie: pasek kontekstowy u góry, zakładki i „+" pod kciukiem. */
export function UkladTelefon({
  ekran,
  onEkran,
  jestemRodzicem,
  gorny,
  onDodaj,
  dodawanieOtwarte,
  children,
}: Props) {
  const dodawanie = etykietaDodania(ekran, jestemRodzicem)

  return (
    <div className="kokpit kokpit-telefon">
      <header className="pasek-gorny">{gorny}</header>

      <main className="tresc-telefonu">{children}</main>

      {/* Przycisku nie ma wcale tam, gdzie nie wolno dodawać - lepiej niż
          błąd po kliknięciu. Decyduje o tym `etykietaDodania`. */}
      {dodawanie && (
        <button
          type="button"
          className="dodaj"
          onClick={onDodaj}
          aria-label={dodawanie}
          aria-haspopup="dialog"
          aria-expanded={dodawanieOtwarte}
        >
          +
        </button>
      )}

      <nav className="pasek-dolny" aria-label="Główna">
        {EKRANY.map((e) => (
          <button
            key={e}
            type="button"
            className={`zakladka-dolna${ekran === e ? ' aktywna' : ''}`}
            aria-current={ekran === e ? 'page' : undefined}
            onClick={() => onEkran(e)}
          >
            {TYTULY[e]}
          </button>
        ))}
      </nav>
    </div>
  )
}
