import { useMemo, type CSSProperties, type ReactNode } from 'react'
import type { DomownikDb } from '../lib/supabase'
import type { Wydarzenie } from '../useWydarzenia'
import { godzinaHM, minutyOdPolnocy, ukladajKolumny, wJednymDniu } from '../czas'
import { dlugaDataZDniem, klucz } from '../dates'
import { kolor } from '../kolory'
import { NEUTRALNE } from '../osoby'
import { MINUT_W_DOBIE, zakresGodzin } from './zakresGodzin'
import { pogrupujPlanDnia } from './planDnia'

const WYSOKOSC_TORU = 28

type Props = {
  domownicy: DomownikDb[]
  wydarzenia: Wydarzenie[]
  /** Dane dnia jeszcze lecą - patrz `Szkielet` na dole pliku. */
  ladowanie?: boolean
  /**
   * Lista zamiast osi czasu. Na 390px oś chowała 363 z 706 pikseli treści za
   * przewijaniem w bok (zmierzone), a sama kolumna imion zjadała 37% szerokości
   * - przy czym zwykle większość torów i tak jest pusta. Lista mówi to samo
   * krócej i w całości mieści się na ekranie.
   */
  lista?: boolean
  /** Przeglądany dzień - niezależny od żywego zegara Dashboardu, patrz `onPrzesun`. */
  dzien: Date
  onPrzesun: (kierunek: -1 | 1) => void
  onDzis: () => void
}

/**
 * Poziomy "schedule view" jak w Outlooku: jeden wiersz na domownika, oś
 * pozioma to godziny. Nakładające się wydarzenia tej samej osoby układa
 * `ukladajKolumny` z czas.ts - ten sam algorytm co w SiatkaGodzin.tsx,
 * tylko obrócony o 90°: kolumny stają się poziomymi torami w obrębie wiersza.
 */
export function GrafikDnia({ domownicy, wydarzenia, ladowanie, lista, dzien, onPrzesun, onDzis }: Props) {
  const godzinne = useMemo(
    () => wydarzenia.filter((w) => !w.calodniowe && wJednymDniu(w)),
    [wydarzenia],
  )
  const bezOsobyGodzinne = useMemo(() => godzinne.filter((w) => w.osobyId.length === 0), [godzinne])

  const { godzinaOd, godzinaDo } = useMemo(() => zakresGodzin(godzinne), [godzinne])
  const liczbaGodzin = godzinaDo - godzinaOd
  const zakresOdMinut = godzinaOd * 60
  const zakresMinut = liczbaGodzin * 60

  const naglowek = <NaglowekDnia dzien={dzien} onPrzesun={onPrzesun} onDzis={onDzis} />

  // Sama linijka godzin bez żadnego wiersza wygląda jak ekran, który się nie
  // wczytał - lepiej powiedzieć wprost, że nic tu nie ma. Dotyczy też
  // domu bez domowników.
  // Kolejność ma znaczenie: bez danych KAŻDY dzień wygląda na pusty, więc
  // „Nic nie zaplanowane" przed czasem byłoby po prostu nieprawdą.
  if (ladowanie) {
    return (
      <Szkielet naglowek={naglowek} domownicy={domownicy} liczbaGodzin={liczbaGodzin} godzinaOd={godzinaOd} />
    )
  }

  // Ktoś zajęty ALBO coś nieprzypisanego - w obu przypadkach dzień nie jest
  // pusty. `.some` na pustej liście domowników daje `false`, więc dom bez
  // nikogo z samym nieprzypisanym wydarzeniem trafia poprawnie do gałęzi
  // "coś tu jest", nie do "pusto".
  const pusto =
    !domownicy.some((osoba) => godzinne.some((w) => w.osobyId.includes(osoba.id))) &&
    bezOsobyGodzinne.length === 0

  if (lista && !pusto) {
    return (
      <ListaPlanu naglowek={naglowek} domownicy={domownicy} godzinne={godzinne} />
    )
  }

  if (pusto) {
    return (
      <div className="karta grafik-dnia">
        {naglowek}
        <p className="pusto">Nic nie zaplanowane.</p>
      </div>
    )
  }

  return (
    <div className="karta grafik-dnia">
      {naglowek}

      <div className="gd-godziny" style={{ '--godzin': liczbaGodzin } as CSSProperties}>
        {Array.from({ length: liczbaGodzin }, (_, i) => godzinaOd + i).map((g) => (
          <div key={g} className="gd-godzina">
            {String(g).padStart(2, '0')}:00
          </div>
        ))}
      </div>

      <div className="gd-wiersze">
        {domownicy.map((osoba) => {
          const wydarzeniaOsoby = godzinne.filter((w) => w.osobyId.includes(osoba.id))
          const ulozone = ukladajKolumny(wydarzeniaOsoby)
          // Najwyższa liczba nakładających się wydarzeń w CAŁYM wierszu tej
          // osoby - może się różnić między grupami (np. dwa osobne, niena-
          // kładające się spotkania w ciągu dnia), więc bierzemy maksimum,
          // nie kolumn pierwszego elementu.
          const tory = ulozone.reduce((maks, w) => Math.max(maks, w.kolumn), 1)
          const barwa = kolor(osoba.color)

          return (
            <div key={osoba.id} className="gd-wiersz" style={{ minHeight: tory * WYSOKOSC_TORU }}>
              <div className="gd-etykieta">
                <span className="kropka" style={{ background: barwa.kropka }} aria-hidden="true" />
                {osoba.name}
              </div>

              <div className="gd-tor-kontener">
                {ulozone.map((w) => {
                  const odMinut = minutyOdPolnocy(w.start)
                  const doMinut = minutyOdPolnocy(w.koniec) || MINUT_W_DOBIE

                  // Wysokość i pozycja pionowa w stałych pikselach (nie w %
                  // wysokości wiersza) - inaczej pojedyncze wydarzenie w
                  // wierszu, którego wysokość narzuciła INNA, bardziej
                  // nakładająca się grupa czasowa tej samej osoby, rozciąg-
                  // nęłoby się na cały wiersz zamiast zająć jeden tor.
                  return (
                    <div
                      key={w.id}
                      className="gd-blok"
                      title={`${godzinaHM(w.start)}–${godzinaHM(w.koniec)} ${w.tytul}`}
                      style={{
                        left: `${((odMinut - zakresOdMinut) / zakresMinut) * 100}%`,
                        width: `${((doMinut - odMinut) / zakresMinut) * 100}%`,
                        top: w.kolumna * WYSOKOSC_TORU + 2,
                        height: WYSOKOSC_TORU - 4,
                        background: barwa.tlo,
                        color: barwa.tekst,
                        borderLeftColor: barwa.kropka,
                      }}
                    >
                      {w.tytul}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {bezOsobyGodzinne.length > 0 && (
          <WierszBezOsoby
            wydarzenia={bezOsobyGodzinne}
            zakresOdMinut={zakresOdMinut}
            zakresMinut={zakresMinut}
          />
        )}
      </div>
    </div>
  )
}

/** Poprzedni/następny dzień, dzisiejsza data (albo „Dziś") i skrót powrotu -
 *  ten sam pasek w każdym stanie karty (szkielet/pusto/dane), żeby nawigacja
 *  nie znikała ani nie skakała w zależności od tego, co akurat pokazuje dzień. */
function NaglowekDnia({
  dzien,
  onPrzesun,
  onDzis,
}: {
  dzien: Date
  onPrzesun: (kierunek: -1 | 1) => void
  onDzis: () => void
}) {
  const jestDzis = klucz(dzien) === klucz(new Date())

  return (
    <div className="sterowanie">
      <button type="button" className="strzalka" onClick={() => onPrzesun(-1)} aria-label="Poprzedni dzień">
        ‹
      </button>
      <h2 className="miesiac">{jestDzis ? 'Dziś w planie' : dlugaDataZDniem(dzien)}</h2>
      <button type="button" className="strzalka" onClick={() => onPrzesun(1)} aria-label="Następny dzień">
        ›
      </button>
      {!jestDzis && (
        <button type="button" className="dzis" onClick={onDzis}>
          Dziś
        </button>
      )}
    </div>
  )
}

/** Wiersz "Bez osoby" w siatce - te same tory/kolumny co wiersz domownika,
 *  tylko neutralnym kolorem (patrz `NEUTRALNE` w `osoby.ts`, ten sam, co w
 *  widoku miesiąca dla wydarzeń bez przypisania). Widoczny tylko, gdy tego
 *  dnia realnie jest coś nieprzypisanego - patrz `pusto` w `GrafikDnia`. */
function WierszBezOsoby({
  wydarzenia,
  zakresOdMinut,
  zakresMinut,
}: {
  wydarzenia: Wydarzenie[]
  zakresOdMinut: number
  zakresMinut: number
}) {
  const ulozone = ukladajKolumny(wydarzenia)
  const tory = ulozone.reduce((maks, w) => Math.max(maks, w.kolumn), 1)

  return (
    <div className="gd-wiersz" style={{ minHeight: tory * WYSOKOSC_TORU }}>
      <div className="gd-etykieta">
        <span className="kropka" style={{ background: NEUTRALNE.kropka }} aria-hidden="true" />
        Bez osoby
      </div>

      <div className="gd-tor-kontener">
        {ulozone.map((w) => {
          const odMinut = minutyOdPolnocy(w.start)
          const doMinut = minutyOdPolnocy(w.koniec) || MINUT_W_DOBIE

          return (
            <div
              key={w.id}
              className="gd-blok"
              title={`${godzinaHM(w.start)}–${godzinaHM(w.koniec)} ${w.tytul}`}
              style={{
                left: `${((odMinut - zakresOdMinut) / zakresMinut) * 100}%`,
                width: `${((doMinut - odMinut) / zakresMinut) * 100}%`,
                top: w.kolumna * WYSOKOSC_TORU + 2,
                height: WYSOKOSC_TORU - 4,
                background: NEUTRALNE.tlo,
                color: NEUTRALNE.tekst,
                borderLeftColor: NEUTRALNE.kropka,
              }}
            >
              {w.tytul}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type SzkieletProps = {
  naglowek: ReactNode
  domownicy: DomownikDb[]
  liczbaGodzin: number
  godzinaOd: number
}

/**
 * Grafik w trakcie ładowania: ta sama struktura, te same wiersze, te same
 * imiona - tylko tory zamiast bloków. Wysokość karty jest więc identyczna
 * przed danymi i po nich, więc nic się pod spodem nie przesuwa.
 *
 * Liczba wierszy jest znana od ręki: `domownicy` przychodzą z App (useDomownicy)
 * i nie mają nic wspólnego z hakami, na które czeka Dashboard.
 */
function Szkielet({ naglowek, domownicy, liczbaGodzin, godzinaOd }: SzkieletProps) {
  return (
    <div className="karta grafik-dnia" aria-busy="true" aria-label="Wczytuję grafik dnia">
      {naglowek}

      <div className="gd-godziny" style={{ '--godzin': liczbaGodzin } as CSSProperties}>
        {Array.from({ length: liczbaGodzin }, (_, i) => godzinaOd + i).map((g) => (
          <div key={g} className="gd-godzina">
            {String(g).padStart(2, '0')}:00
          </div>
        ))}
      </div>

      <div className="gd-wiersze">
        {domownicy.map((osoba) => (
          <div key={osoba.id} className="gd-wiersz" style={{ minHeight: WYSOKOSC_TORU }}>
            <div className="gd-etykieta">
              <span
                className="kropka"
                style={{ background: kolor(osoba.color).kropka }}
                aria-hidden="true"
              />
              {osoba.name}
            </div>
            <div className="gd-tor-kontener szkielet" />
          </div>
        ))}
      </div>
    </div>
  )
}

type ListaProps = {
  naglowek: ReactNode
  domownicy: DomownikDb[]
  godzinne: Wydarzenie[]
}

/**
 * Plan dnia jako lista - wariant telefonowy (patrz prop `lista`).
 *
 * Wolni lądują w jednej linijce na dole zamiast dostawać własny, pusty wiersz:
 * „Marcin nic dziś nie ma" to jedno słowo informacji, a na osi czasu kosztowało
 * tyle samo miejsca co pełny dzień.
 */
function ListaPlanu({ naglowek, domownicy, godzinne }: ListaProps) {
  const { zajeci, wolni, bezOsoby } = pogrupujPlanDnia(domownicy, godzinne)

  return (
    <section className="karta plan-dnia">
      {naglowek}

      <ul className="plan-osoby">
        {zajeci.map(({ osoba, wydarzenia }) => {
          const barwa = kolor(osoba.color)
          return (
            <li key={osoba.id}>
              <p className="plan-osoba">
                <span className="kropka" style={{ background: barwa.kropka }} aria-hidden="true" />
                {osoba.name}
              </p>
              <ul className="plan-wydarzenia">
                {wydarzenia.map((w) => (
                  <li key={w.id}>
                    <span className="czas">
                      {godzinaHM(w.start)}–{godzinaHM(w.koniec)}
                    </span>
                    <span className="nazwa">{w.tytul}</span>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}

        {bezOsoby.length > 0 && (
          <li>
            <p className="plan-osoba">
              <span className="kropka" style={{ background: NEUTRALNE.kropka }} aria-hidden="true" />
              Bez osoby
            </p>
            <ul className="plan-wydarzenia">
              {bezOsoby.map((w) => (
                <li key={w.id}>
                  <span className="czas">
                    {godzinaHM(w.start)}–{godzinaHM(w.koniec)}
                  </span>
                  <span className="nazwa">{w.tytul}</span>
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>

      {wolni.length > 0 && (
        <p className="plan-wolni">
          Wolni: {wolni.map((o) => o.name).join(', ')}
        </p>
      )}
    </section>
  )
}
