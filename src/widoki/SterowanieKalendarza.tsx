export type Widok = 'miesiac' | 'tydzien' | 'dzien'

const NAZWY_WIDOKOW: Record<Widok, string> = {
  miesiac: 'Miesiąc',
  tydzien: 'Tydzień',
  dzien: 'Dzień',
}

type Props = {
  naglowek: string
  widok: Widok
  onWidok: (w: Widok) => void
  onPrzesun: (kierunek: -1 | 1) => void
  onDzis: () => void
}

/**
 * Strzałki, zakres dat, „Dziś" i przełącznik widoków. Wydzielone, bo na
 * komputerze siedzą nad siatką, a na telefonie w górnym pasku - i mają być
 * tym samym kodem, nie dwiema kopiami.
 */
export function SterowanieKalendarza({
  naglowek,
  widok,
  onWidok,
  onPrzesun,
  onDzis,
}: Props) {
  return (
    <>
      <div className="sterowanie">
        <button
          type="button"
          className="strzalka"
          onClick={() => onPrzesun(-1)}
          aria-label="Wstecz"
        >
          ‹
        </button>
        <h2 className="miesiac">{naglowek}</h2>
        <button
          type="button"
          className="strzalka"
          onClick={() => onPrzesun(1)}
          aria-label="Dalej"
        >
          ›
        </button>
        <button type="button" className="dzis" onClick={onDzis}>
          Dziś
        </button>
      </div>

      <div className="zakladki widoki" role="group" aria-label="Zakres widoku">
        {(Object.keys(NAZWY_WIDOKOW) as Widok[]).map((w) => (
          <button
            key={w}
            type="button"
            className={`zakladka${widok === w ? ' aktywna' : ''}`}
            aria-pressed={widok === w}
            onClick={() => onWidok(w)}
          >
            {NAZWY_WIDOKOW[w]}
          </button>
        ))}
      </div>
    </>
  )
}
