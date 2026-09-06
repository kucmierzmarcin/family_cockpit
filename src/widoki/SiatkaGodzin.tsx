import { useEffect, useRef } from 'react'
import type { DomownikDb } from '../lib/supabase'
import type { Wydarzenie } from '../useWydarzenia'
import {
  godzinaHM,
  minutyOdPolnocy,
  nachodzi,
  nastepnyDzien,
  poczatekDnia,
  ukladajKolumny,
  wJednymDniu,
} from '../czas'
import { klucz } from '../dates'
import { barwyWydarzenia } from '../osoby'
import { KropkiOsob } from './KropkiOsob'

/** Wysokość jednej godziny w pikselach - stąd biorą się pozycje bloków. */
const WYSOKOSC_GODZINY = 48
const MINUT_W_DOBIE = 24 * 60

/** Widok otwiera się przewinięty tutaj - poranek zamiast nocy. */
const GODZINA_STARTOWA = 7

/** Blok krótszego wydarzenia i tak musi dać się kliknąć i przeczytać. */
const MINIMALNA_WYSOKOSC = 22

type Props = {
  dni: Date[]
  wydarzenia: Wydarzenie[]
  osobaPoId: Map<string, DomownikDb>
  dzisiaj: Date
  onKlikWydarzenie: (w: Wydarzenie) => void
  onKlikDzien?: (dzien: Date) => void
}

/** Wspólny silnik widoku tygodnia i dnia: pasek całodniowych + siatka godzin. */
export function SiatkaGodzin({
  dni,
  wydarzenia,
  osobaPoId,
  dzisiaj,
  onKlikWydarzenie,
  onKlikDzien,
}: Props) {
  const przewijane = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Bez tego widok otwiera się na północy, gdzie zwykle nic nie ma.
    if (przewijane.current) {
      przewijane.current.scrollTop = GODZINA_STARTOWA * WYSOKOSC_GODZINY
    }
  }, [])

  const odZakresu = poczatekDnia(dni[0])
  const doZakresu = nastepnyDzien(dni[dni.length - 1])

  // Wydarzenia całodniowe i te ciągnące się przez kilka dni idą paskiem nad
  // siatką - w kolumnie godzin nie dałoby się ich sensownie narysować.
  const paskowe = wydarzenia.filter((w) => w.calodniowe || !wJednymDniu(w))
  const godzinne = wydarzenia.filter((w) => !w.calodniowe && wJednymDniu(w))

  // Barwy bierzemy od pierwszej przypisanej osoby; reszta pokazuje się kropkami.
  function barwy(w: Wydarzenie) {
    return barwyWydarzenia(w.osobyId, osobaPoId)
  }

  return (
    <div className="siatka-godzin">
      <div className="sg-naglowek">
        <div className="sg-rog" />
        {dni.map((d) => {
          const dzis = klucz(d) === klucz(dzisiaj)
          return (
            <button
              key={klucz(d)}
              type="button"
              className={`sg-dzien-naglowek${dzis ? ' dzisiaj' : ''}`}
              onClick={() => onKlikDzien?.(d)}
              disabled={!onKlikDzien}
            >
              <span className="sg-nazwa-dnia">
                {d.toLocaleDateString('pl-PL', { weekday: 'short' })}
              </span>
              <span className="sg-numer-dnia">{d.getDate()}</span>
            </button>
          )
        })}
      </div>

      {paskowe.length > 0 && (
        <div className="sg-calodniowe">
          <div className="sg-etykieta-pasa">cały dzień</div>
          <div className="sg-pasy" style={{ gridTemplateColumns: `repeat(${dni.length}, 1fr)` }}>
            {paskowe.map((w) => {
              // Pasek zaczyna się w pierwszym widocznym dniu wydarzenia i kończy
              // w ostatnim - poza zakresem dostaje strzałkę zamiast ucięcia.
              const pierwszy = Math.max(
                0,
                dni.findIndex((d) => nachodzi(w, poczatekDnia(d), nastepnyDzien(d))),
              )
              const ostatni = dni.reduce(
                (akt, d, i) => (nachodzi(w, poczatekDnia(d), nastepnyDzien(d)) ? i : akt),
                pierwszy,
              )
              const b = barwy(w)

              return (
                <button
                  key={w.id}
                  type="button"
                  className="sg-pas"
                  style={{
                    gridColumn: `${pierwszy + 1} / ${ostatni + 2}`,
                    background: b.tlo,
                    color: b.tekst,
                  }}
                  onClick={() => onKlikWydarzenie(w)}
                  title={w.tytul}
                >
                  {w.start < odZakresu && <span aria-hidden="true">◀ </span>}
                  {w.tytul}
                  <KropkiOsob osobyId={w.osobyId} osobaPoId={osobaPoId} />
                  {w.koniec > doZakresu && <span aria-hidden="true"> ▶</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="sg-przewijane" ref={przewijane}>
        <div className="sg-tresc" style={{ height: (MINUT_W_DOBIE / 60) * WYSOKOSC_GODZINY }}>
          <div className="sg-godziny">
            {Array.from({ length: 24 }, (_, g) => (
              <div key={g} className="sg-godzina" style={{ height: WYSOKOSC_GODZINY }}>
                <span>{String(g).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          <div className="sg-kolumny" style={{ gridTemplateColumns: `repeat(${dni.length}, 1fr)` }}>
            {dni.map((d) => {
              const poczatek = poczatekDnia(d)
              const koniecDnia = nastepnyDzien(d)
              const wTymDniu = godzinne.filter((w) => nachodzi(w, poczatek, koniecDnia))
              const ulozone = ukladajKolumny(wTymDniu)

              return (
                <div key={klucz(d)} className="sg-kolumna">
                  {Array.from({ length: 24 }, (_, g) => (
                    <div key={g} className="sg-kratka" style={{ height: WYSOKOSC_GODZINY }} />
                  ))}

                  {ulozone.map((w) => {
                    const odMinut = minutyOdPolnocy(w.start)
                    const doMinut = minutyOdPolnocy(w.koniec) || MINUT_W_DOBIE
                    const wysokosc = Math.max(
                      MINIMALNA_WYSOKOSC,
                      ((doMinut - odMinut) / 60) * WYSOKOSC_GODZINY,
                    )
                    const b = barwy(w)
                    const szerokosc = 100 / w.kolumn

                    return (
                      <button
                        key={w.id}
                        type="button"
                        className="sg-blok"
                        style={{
                          top: (odMinut / 60) * WYSOKOSC_GODZINY,
                          height: wysokosc,
                          left: `${w.kolumna * szerokosc}%`,
                          width: `calc(${szerokosc}% - 4px)`,
                          background: b.tlo,
                          color: b.tekst,
                          borderLeftColor: b.kropka,
                        }}
                        onClick={() => onKlikWydarzenie(w)}
                        title={`${godzinaHM(w.start)}–${godzinaHM(w.koniec)} ${w.tytul}`}
                      >
                        <span className="sg-blok-godzina">
                          {godzinaHM(w.start)}
                          <KropkiOsob osobyId={w.osobyId} osobaPoId={osobaPoId} />
                        </span>
                        <span className="sg-blok-tytul">{w.tytul}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
