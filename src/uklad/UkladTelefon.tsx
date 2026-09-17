import { useState, type ReactNode } from 'react'
import {
  EKRANY_TELEFON,
  EKRANY_WIECEJ,
  TYTULY,
  etykietaDodania,
  wZakladceWiecej,
  type Ekran,
} from './nawigacja'
import { Ikona, Kropki } from './Ikony'
import { Arkusz } from './Arkusz'

type Props = {
  ekran: Ekran
  onEkran: (e: Ekran) => void
  jestemRodzicem: boolean
  /** Sterowanie kalendarza do górnego paska; `null` na pozostałych ekranach,
      gdzie pasek niesie sam tytuł. */
  gorny?: ReactNode
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
  const [wiecejOtwarte, setWiecejOtwarte] = useState(false)
  const podWiecej = wZakladceWiecej(ekran)

  function idzDo(e: Ekran) {
    setWiecejOtwarte(false)
    onEkran(e)
  }

  return (
    <div className="kokpit kokpit-telefon">
      {/* Tytuł ekranu jest <h1> zawsze - na kalendarzu schodzi do samego odczytu,
          bo w sticky pasku miejsce zajmuje już nazwa miesiąca (też nagłówek,
          poziom niżej). */}
      <header className="pasek-gorny">
        <h1 className={gorny ? 'tylko-dla-czytnika' : 'tytul-ekranu'}>{TYTULY[ekran]}</h1>
        {gorny}
      </header>

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

      {/* Pięć celów, nie siedem: przy siedmiu „Kalendarz" nie mieści się w
          swojej kolumnie na 360-pikselowym ekranie. Trzy rzadsze ekrany
          siedzą pod „Więcej" - patrz EKRANY_TELEFON w nawigacja.ts. */}
      <nav className="pasek-dolny" aria-label="Główna">
        {EKRANY_TELEFON.map((e) => (
          <button
            key={e}
            type="button"
            className={`zakladka-dolna${ekran === e ? ' aktywna' : ''}`}
            aria-current={ekran === e ? 'page' : undefined}
            onClick={() => idzDo(e)}
          >
            <Ikona ekran={e} />
            <span className="zakladka-dolna-etykieta">{TYTULY[e]}</span>
          </button>
        ))}

        <button
          type="button"
          className={`zakladka-dolna${podWiecej ? ' aktywna' : ''}`}
          aria-current={podWiecej ? 'page' : undefined}
          aria-haspopup="dialog"
          aria-expanded={wiecejOtwarte}
          onClick={() => setWiecejOtwarte(true)}
        >
          <Kropki />
          <span className="zakladka-dolna-etykieta">Więcej</span>
        </button>
      </nav>

      <Arkusz
        otwarty={wiecejOtwarte}
        tytul="Więcej"
        onZamknij={() => setWiecejOtwarte(false)}
      >
        <ul className="lista-wiecej">
          {EKRANY_WIECEJ.map((e) => (
            <li key={e}>
              <button
                type="button"
                className={`pozycja-wiecej${ekran === e ? ' aktywna' : ''}`}
                aria-current={ekran === e ? 'page' : undefined}
                onClick={() => idzDo(e)}
              >
                <Ikona ekran={e} />
                {TYTULY[e]}
              </button>
            </li>
          ))}
        </ul>
      </Arkusz>
    </div>
  )
}
