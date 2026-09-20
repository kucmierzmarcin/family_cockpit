import { useEffect, useMemo, useState } from 'react'
import type { DomownikDb } from './lib/supabase'
import type { Paczka } from './paczki'
import { blokiSzkolne, type Lekcja, type Obecnosc, type Uczen, type Wiadomosc } from './vulcan'
import type { Ekran } from './uklad/nawigacja'
import { useTelefon } from './uklad/useTelefon'
import { dlugaData, klucz } from './dates'
import { godzinaHM, nastepnyDzien, poczatekDnia } from './czas'
import { useWydarzenia } from './useWydarzenia'
import { useTerminy } from './useTerminy'
import { useTablica } from './useTablica'
import { useZakupy } from './useZakupy'
import {
  czyPilnePaczki,
  liczNieusprawiedliwione,
  liczPaczkiDoOdbioru,
  liczPilneTerminy,
  liczWiadomosciDzis,
} from './dashboardLiczniki'
import { policzPozostale } from './pozycje'
import { wydarzeniaRocznic, type Rocznica } from './rocznice'
import { GrafikDnia } from './widoki/GrafikDnia'
import { PogodaWidget } from './widoki/PogodaWidget'

type Props = {
  householdId: string
  domownicy: DomownikDb[]
  wiadomosci: Wiadomosc[]
  lekcje: Lekcja[]
  uczniowie: Uczen[]
  obecnosci: Obecnosc[]
  rocznice: Rocznica[]
  paczki: Paczka[]
  paczkiLadowanie: boolean
  onBlad: (tekst: string) => void
  onEkran: (e: Ekran) => void
}

/** Ekran „Dziś": pogoda, zegar, grafik dnia całej rodziny i sześć liczników. */
export function Dashboard({
  householdId,
  domownicy,
  wiadomosci,
  lekcje,
  uczniowie,
  obecnosci,
  rocznice,
  paczki,
  paczkiLadowanie,
  onBlad,
  onEkran,
}: Props) {
  const telefon = useTelefon()
  const [teraz, setTeraz] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setTeraz(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const dzisiaj = klucz(teraz)

  // Dzień przeglądany w grafiku - niezależny od `teraz`: strzałki obok planu
  // dnia nie mają ruszać licznikami niżej, które zawsze mówią o prawdziwym
  // dzisiaj (patrz `dzisiaj` wyżej), tylko samą kartę z planem.
  const [dzienGrafiku, setDzienGrafiku] = useState(() => poczatekDnia(new Date()))
  const kluczGrafiku = klucz(dzienGrafiku)
  function przesunGrafik(kierunek: -1 | 1) {
    setDzienGrafiku((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + kierunek))
  }

  // Osobne wywołanie useWydarzenia, niezależne od tego, po jakim zakresie
  // nawiguje akurat zakładka „kalendarz" (tamten `dane` w App.tsx pokazuje
  // miesiąc/tydzień/dzień zależnie od stanu `widok`). Stąd też własna nazwa
  // kanału Realtime - oba wywołania żyją naraz i nie mogą dzielić kanału.
  const dane = useWydarzenia(
    dzienGrafiku,
    nastepnyDzien(dzienGrafiku),
    onBlad,
    'dashboard-kalendarz-na-zywo',
  )
  const terminy = useTerminy(householdId, onBlad)
  const tablica = useTablica(onBlad)
  const zakupy = useZakupy(onBlad)

  // Bloki „Szkoła" nie mieszkają w `events` (patrz kalendarz ogólny w App.tsx),
  // więc grafik dnia trzeba nimi ręcznie dosycić - inaczej dzień z samymi
  // lekcjami wygląda jak dzień bez niczego zaplanowanego. Filtr do dnia
  // przeglądanego w grafiku, nie zawsze do dzisiaj - inaczej strzałki
  // przesuwałyby zwykłe wydarzenia, ale plan lekcji zostawałyby na dzisiejszym.
  // Rocznice też są syntetyczne (liczone w locie, patrz `wydarzeniaRocznic`),
  // tym samym wzorcem co bloki „Szkoła" tuż wyżej - w odróżnieniu od Kalendarza
  // (App.tsx) Dashboard ich wcześniej wcale nie doliczał, więc urodziny czy
  // rocznice nie były tu widoczne w ogóle.
  const wydarzeniaZeSzkola = useMemo(
    () => [
      ...dane.wydarzenia,
      ...blokiSzkolne(lekcje, uczniowie).filter((w) => klucz(w.start) === kluczGrafiku),
      ...wydarzeniaRocznic(rocznice).filter((w) => klucz(w.start) === kluczGrafiku),
    ],
    [dane.wydarzenia, lekcje, uczniowie, rocznice, kluczGrafiku],
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
  const liczbaPaczek = useMemo(() => liczPaczkiDoOdbioru(paczki), [paczki])
  const paczkiPilne = useMemo(() => czyPilnePaczki(paczki, teraz), [paczki, teraz])

  // Żadnej bramki na cały ekran: każdy kawałek czeka na SWOJE dane, nie na
  // cudze. Wcześniej jedno `||` po czterech hakach chowało również zegar, który
  // nie potrzebuje sieci, a cały ekran schodził do jednego akapitu - z 330px
  // na 733px po nadejściu danych (zmierzone).
  const cokolwiekLaduje =
    dane.ladowanie || terminy.ladowanie || tablica.ladowanie || zakupy.ladowanie

  return (
    <div className="dashboard" aria-busy={cokolwiekLaduje || undefined}>
      <div className="dash-karty">
        <div className="karta dash-zegar">
          <p className="dash-godzina">{godzinaHM(teraz)}</p>
          <p className="dash-data">{dlugaData(teraz)}</p>
        </div>

        <div className="karta dash-pogoda">
          <PogodaWidget />
        </div>
      </div>

      <GrafikDnia
        domownicy={domownicy}
        wydarzenia={wydarzeniaZeSzkola}
        ladowanie={dane.ladowanie}
        lista={telefon}
        dzien={dzienGrafiku}
        onPrzesun={przesunGrafik}
        onDzis={() => setDzienGrafiku(poczatekDnia(new Date()))}
      />

      <div className="dash-liczniki">
        <LicznikDnia
          etykieta="Pilne terminy"
          wartosc={liczbaPilnychTerminow}
          pilny={liczbaPilnychTerminow > 0}
          ladowanie={terminy.ladowanie}
          onKlik={() => onEkran('terminy')}
        />
        {/* Wiadomości i nieobecności przychodzą propsami z App (useVulcan), więc
            tu nie mają własnego stanu ładowania. */}
        <LicznikDnia
          etykieta="Wiadomości dziś"
          wartosc={liczbaWiadomosciDzis}
          onKlik={() => onEkran('szkola')}
        />
        <LicznikDnia
          etykieta="Otwarte tematy"
          wartosc={liczbaOtwartychTematow}
          ladowanie={tablica.ladowanie}
          onKlik={() => onEkran('tablica')}
        />
        <LicznikDnia
          etykieta="Do kupienia"
          wartosc={liczbaDoKupienia}
          ladowanie={zakupy.ladowanie}
          onKlik={() => onEkran('zakupy')}
        />
        <LicznikDnia
          etykieta="Nieusprawiedliwione"
          wartosc={liczbaNieusprawiedliwionych}
          pilny={liczbaNieusprawiedliwionych > 0}
          onKlik={() => onEkran('szkola')}
        />
        <LicznikDnia
          etykieta="Paczki do odbioru"
          wartosc={liczbaPaczek}
          pilny={paczkiPilne}
          ladowanie={paczkiLadowanie}
          onKlik={() => onEkran('paczki')}
        />
      </div>
    </div>
  )
}

type LicznikProps = {
  etykieta: string
  wartosc: number
  pilny?: boolean
  ladowanie?: boolean
  onKlik: () => void
}

/**
 * Pudełko licznika ma ten sam rozmiar przed danymi i po nich - w miejscu liczby
 * stoi półpauza, a nie pustka, więc nic się nie przesuwa. `aria-busy` mówi
 * czytnikowi ekranu, że to jeszcze nie jest wartość; bez tego „— pilne
 * terminy" brzmi jak odpowiedź.
 *
 * W trakcie ładowania licznik nie może też świecić na czerwono: `wartosc` jest
 * wtedy zerem z pierwszego renderu, a nie prawdą o dniu.
 */
function LicznikDnia({ etykieta, wartosc, pilny, ladowanie, onKlik }: LicznikProps) {
  return (
    <button
      type="button"
      className={`karta dash-licznik${pilny && !ladowanie ? ' dash-licznik-pilny' : ''}`}
      aria-busy={ladowanie || undefined}
      onClick={onKlik}
    >
      <span className="dash-licznik-wartosc">{ladowanie ? '—' : wartosc}</span>
      <span className="dash-licznik-etykieta">{etykieta}</span>
    </button>
  )
}
