import { useEffect, useMemo, useState } from 'react'
import type { DomownikDb } from './lib/supabase'
import { blokiSzkolne, type Lekcja, type Obecnosc, type Uczen, type Wiadomosc } from './vulcan'
import type { Ekran } from './uklad/nawigacja'
import { dlugaData, klucz } from './dates'
import { godzinaHM, nastepnyDzien, poczatekDnia } from './czas'
import { useWydarzenia } from './useWydarzenia'
import { useTerminy } from './useTerminy'
import { useTablica } from './useTablica'
import { useZakupy } from './useZakupy'
import { liczNieusprawiedliwione, liczPilneTerminy, liczWiadomosciDzis } from './dashboardLiczniki'
import { policzPozostale } from './pozycje'
import { GrafikDnia } from './widoki/GrafikDnia'
import { PogodaWidget } from './widoki/PogodaWidget'

type Props = {
  householdId: string
  domownicy: DomownikDb[]
  wiadomosci: Wiadomosc[]
  lekcje: Lekcja[]
  uczniowie: Uczen[]
  obecnosci: Obecnosc[]
  onBlad: (tekst: string) => void
  onEkran: (e: Ekran) => void
}

/** Ekran „Dziś": pogoda, zegar, grafik dnia całej rodziny i pięć liczników. */
export function Dashboard({
  householdId,
  domownicy,
  wiadomosci,
  lekcje,
  uczniowie,
  obecnosci,
  onBlad,
  onEkran,
}: Props) {
  const [teraz, setTeraz] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setTeraz(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const dzisiaj = klucz(teraz)
  // Osobne wywołanie useWydarzenia, niezależne od tego, po jakim zakresie
  // nawiguje akurat zakładka „kalendarz" (tamten `dane` w App.tsx pokazuje
  // miesiąc/tydzień/dzień zależnie od stanu `widok`). Stąd też własna nazwa
  // kanału Realtime - oba wywołania żyją naraz i nie mogą dzielić kanału.
  // Nowe obiekty Date przy każdym tyknięciu zegara są bezpieczne: useWydarzenia
  // sprowadza zakres do tekstu, zanim trafi do zależności efektu.
  const dane = useWydarzenia(
    poczatekDnia(teraz),
    nastepnyDzien(teraz),
    onBlad,
    'dashboard-kalendarz-na-zywo',
  )
  const terminy = useTerminy(householdId, onBlad)
  const tablica = useTablica(onBlad)
  const zakupy = useZakupy(onBlad)

  // Bloki „Szkoła" nie mieszkają w `events` (patrz kalendarz ogólny w App.tsx),
  // więc grafik dnia trzeba nimi ręcznie dosycić - inaczej dzień z samymi
  // lekcjami wygląda jak dzień bez niczego zaplanowanego. Filtr do „dzisiaj":
  // `blokiSzkolne` grupuje WSZYSTKIE zsynchronizowane lekcje, nie tylko dziś.
  const wydarzeniaZeSzkola = useMemo(
    () => [
      ...dane.wydarzenia,
      ...blokiSzkolne(lekcje, uczniowie).filter((w) => klucz(w.start) === dzisiaj),
    ],
    [dane.wydarzenia, lekcje, uczniowie, dzisiaj],
  )

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
  const liczbaNieusprawiedliwionych = useMemo(() => liczNieusprawiedliwione(obecnosci), [obecnosci])

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
          <PogodaWidget />
        </div>
      </div>

      <GrafikDnia domownicy={domownicy} wydarzenia={wydarzeniaZeSzkola} />

      <div className="dash-liczniki">
        <LicznikDnia
          etykieta="Pilne terminy"
          wartosc={liczbaPilnychTerminow}
          pilny={liczbaPilnychTerminow > 0}
          onKlik={() => onEkran('terminy')}
        />
        <LicznikDnia
          etykieta="Wiadomości dziś"
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
        <LicznikDnia
          etykieta="Nieusprawiedliwione"
          wartosc={liczbaNieusprawiedliwionych}
          pilny={liczbaNieusprawiedliwionych > 0}
          onKlik={() => onEkran('szkola')}
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
