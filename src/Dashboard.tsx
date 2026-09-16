import { useEffect, useMemo, useState } from 'react'
import type { DomownikDb } from './lib/supabase'
import type { Wiadomosc } from './vulcan'
import type { Ekran } from './uklad/nawigacja'
import { dlugaData, klucz } from './dates'
import { godzinaHM, nastepnyDzien, poczatekDnia } from './czas'
import { useWydarzenia } from './useWydarzenia'
import { useTerminy } from './useTerminy'
import { useTablica } from './useTablica'
import { useZakupy } from './useZakupy'
import { opisPogody, usePogoda } from './usePogoda'
import { liczPilneTerminy, liczWiadomosciDzis } from './dashboardLiczniki'
import { policzPozostale } from './pozycje'
// Rozszerzenie podane wprost: `./widoki/GrafikDnia` bez rozszerzenia na
// systemie plików nieodróżniającym wielkości liter (Windows) trafia najpierw
// w `./widoki/grafikDnia.ts` (Task 3, ta sama nazwa różniąca się tylko
// wielkością litery) zamiast we właściwy komponent.
import { GrafikDnia } from './widoki/GrafikDnia.tsx'

type Props = {
  householdId: string
  domownicy: DomownikDb[]
  wiadomosci: Wiadomosc[]
  onBlad: (tekst: string) => void
  onEkran: (e: Ekran) => void
}

/** Ekran „Dziś": pogoda, zegar, grafik dnia całej rodziny i cztery liczniki. */
export function Dashboard({ householdId, domownicy, wiadomosci, onBlad, onEkran }: Props) {
  const [teraz, setTeraz] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setTeraz(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const dzisiaj = klucz(teraz)
  // Zakres jako osobne wywołanie useWydarzenia, niezależne od tego, po jakim
  // zakresie nawiguje akurat zakładka „kalendarz" (tamten `dane` w App.tsx
  // pokazuje miesiąc/tydzień/dzień zależnie od stanu `widok`).
  const poczatekDzis = useMemo(() => poczatekDnia(teraz), [dzisiaj])
  const koniecDzis = useMemo(() => nastepnyDzien(teraz), [dzisiaj])

  const dane = useWydarzenia(poczatekDzis, koniecDzis, onBlad)
  const terminy = useTerminy(householdId, onBlad)
  const tablica = useTablica(onBlad)
  const zakupy = useZakupy(onBlad)
  const { pogoda, blad: bladPogody } = usePogoda()

  const liczbaPilnychTerminow = useMemo(
    () => liczPilneTerminy(terminy.terminy, dzisiaj),
    [terminy.terminy, dzisiaj],
  )
  const liczbaWiadomosciDzis = useMemo(
    () => liczWiadomosciDzis(wiadomosci, dzisiaj),
    [wiadomosci, dzisiaj],
  )
  const liczbaOtwartychTematow = tablica.notatki.length
  const liczbaDoKupienia = policzPozostale(zakupy.pozycje)

  const ladowanie = dane.ladowanie || terminy.ladowanie || tablica.ladowanie || zakupy.ladowanie

  if (ladowanie) {
    return <p className="pusto">Wczytuję…</p>
  }

  return (
    <div className="dashboard">
      <div className="dash-karty">
        <div className="karta dash-zegar">
          <p className="dash-godzina">{godzinaHM(teraz)}</p>
          <p className="dash-data">{dlugaData(teraz)}</p>
        </div>

        <div className="karta dash-pogoda">
          {bladPogody ? (
            <p className="pusto">Pogoda niedostępna.</p>
          ) : !pogoda ? (
            <p className="pusto">Wczytuję pogodę…</p>
          ) : (
            <>
              <p className="dash-temperatura">{Math.round(pogoda.teraz.temperatura)}°C</p>
              <p className="dash-opis-pogody">{opisPogody(pogoda.teraz.kod)}</p>
            </>
          )}
        </div>
      </div>

      <GrafikDnia domownicy={domownicy} wydarzenia={dane.wydarzenia} />

      <div className="dash-liczniki">
        <LicznikDnia
          etykieta="Pilne terminy"
          wartosc={liczbaPilnychTerminow}
          pilny={liczbaPilnychTerminow > 0}
          onKlik={() => onEkran('terminy')}
        />
        <LicznikDnia
          etykieta="Nowe wiadomości"
          wartosc={liczbaWiadomosciDzis}
          onKlik={() => onEkran('szkola')}
        />
        <LicznikDnia
          etykieta="Otwarte tematy"
          wartosc={liczbaOtwartychTematow}
          onKlik={() => onEkran('tablica')}
        />
        <LicznikDnia
          etykieta="Do kupienia"
          wartosc={liczbaDoKupienia}
          onKlik={() => onEkran('zakupy')}
        />
      </div>
    </div>
  )
}

type LicznikProps = {
  etykieta: string
  wartosc: number
  pilny?: boolean
  onKlik: () => void
}

function LicznikDnia({ etykieta, wartosc, pilny, onKlik }: LicznikProps) {
  return (
    <button
      type="button"
      className={`karta dash-licznik${pilny ? ' dash-licznik-pilny' : ''}`}
      onClick={onKlik}
    >
      <span className="dash-licznik-wartosc">{wartosc}</span>
      <span className="dash-licznik-etykieta">{etykieta}</span>
    </button>
  )
}
