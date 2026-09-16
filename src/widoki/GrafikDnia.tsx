import { useMemo, type CSSProperties } from 'react'
import type { DomownikDb } from '../lib/supabase'
import type { Wydarzenie } from '../useWydarzenia'
import { godzinaHM, minutyOdPolnocy, ukladajKolumny, wJednymDniu } from '../czas'
import { kolor } from '../kolory'
import { MINUT_W_DOBIE, zakresGodzin } from './zakresGodzin'

const WYSOKOSC_TORU = 28

type Props = {
  domownicy: DomownikDb[]
  wydarzenia: Wydarzenie[]
}

/**
 * Poziomy "schedule view" jak w Outlooku: jeden wiersz na domownika, oś
 * pozioma to godziny. Nakładające się wydarzenia tej samej osoby układa
 * `ukladajKolumny` z czas.ts - ten sam algorytm co w SiatkaGodzin.tsx,
 * tylko obrócony o 90°: kolumny stają się poziomymi torami w obrębie wiersza.
 */
export function GrafikDnia({ domownicy, wydarzenia }: Props) {
  const godzinne = useMemo(
    () => wydarzenia.filter((w) => !w.calodniowe && wJednymDniu(w)),
    [wydarzenia],
  )

  const { godzinaOd, godzinaDo } = useMemo(() => zakresGodzin(godzinne), [godzinne])
  const liczbaGodzin = godzinaDo - godzinaOd
  const zakresOdMinut = godzinaOd * 60
  const zakresMinut = liczbaGodzin * 60

  // Sama linijka godzin bez żadnego wiersza wygląda jak ekran, który się nie
  // wczytał - lepiej powiedzieć wprost, że na dziś nic nie ma. Dotyczy też
  // domu bez domowników.
  const pusto =
    domownicy.length === 0 ||
    domownicy.every((osoba) => !godzinne.some((w) => w.osobyId.includes(osoba.id)))

  if (pusto) {
    return (
      <div className="karta grafik-dnia">
        <p className="pusto">Nic dziś nie zaplanowane.</p>
      </div>
    )
  }

  return (
    <div className="karta grafik-dnia">
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
      </div>
    </div>
  )
}
