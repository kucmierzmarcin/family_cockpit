/**
 * Ważne rocznice (urodziny, imieniny, rocznice) - przechowywane jako
 * dzień+miesiąc(+opcjonalny rok), NIE jako realne wydarzenia w `events`.
 * Kalendarz liczy konkretne wystąpienia w locie przez `wydarzeniaRocznic()`
 * (wzorem `blokiSzkolne()` w `vulcan.ts`) - patrz spec
 * docs/superpowers/specs/2026-09-19-rocznice-design.md.
 *
 * Ten plik nie importuje NICZEGO poza typem `Wydarzenie` (sam typ, bez
 * runtime'u) - testuje się zwykłym vitestem, tak jak `terminy.ts`.
 */
import { nastepnyDzien } from './czas'
import type { Wydarzenie } from './useWydarzenia'

export type TypRocznicy = 'urodziny' | 'imieniny' | 'rocznica' | 'inne'

export type Rocznica = {
  id: string
  tytul: string
  typ: TypRocznicy
  dzien: number
  miesiac: number
  /** Opcjonalny - imieniny zwykle go nie mają; gdy jest, liczy się z niego
   * wiek dla `urodziny`/`rocznica` (nigdy dla `imieniny`/`inne`). */
  rok: number | null
  autorId: string | null
}

export const OPCJE_TYPU: { wartosc: TypRocznicy; etykieta: string }[] = [
  { wartosc: 'urodziny', etykieta: 'Urodziny' },
  { wartosc: 'imieniny', etykieta: 'Imieniny' },
  { wartosc: 'rocznica', etykieta: 'Rocznica' },
  { wartosc: 'inne', etykieta: 'Inne' },
]

const IKONA_TYPU: Record<TypRocznicy, string> = {
  urodziny: '🎂',
  imieniny: '🎉',
  rocznica: '💍',
  inne: '📌',
}

const NAZWA_TYPU: Record<TypRocznicy, string> = {
  urodziny: 'Urodziny',
  imieniny: 'Imieniny',
  rocznica: 'Rocznica',
  inne: 'Inne',
}

export function ikonaTypu(typ: TypRocznicy): string {
  return IKONA_TYPU[typ]
}

export function nazwaTypu(typ: TypRocznicy): string {
  return NAZWA_TYPU[typ]
}

/** Rocznice posortowane po dniu w roku (miesiąc, potem dzień) - kolejność, w
 * jakiej naturalnie następują, niezależnie od aktualnego roku kalendarzowego. */
export function posortujRocznice(rocznice: Rocznica[]): Rocznica[] {
  return [...rocznice].sort((a, b) => a.miesiac - b.miesiac || a.dzien - b.dzien)
}

function czyPrzestepny(rok: number): boolean {
  return (rok % 4 === 0 && rok % 100 !== 0) || rok % 400 === 0
}

const DNI_W_MIESIACU_ZWYKLY = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function dniWMiesiacu(miesiac: number, rok: number): number {
  if (miesiac === 2 && czyPrzestepny(rok)) return 29
  return DNI_W_MIESIACU_ZWYKLY[miesiac - 1]
}

/** Czy `dzien`/`miesiac` to poprawna kombinacja - liczona względem roku
 * przestępnego, więc 29 lutego jest dozwolone jako wejście (samo wystąpienie
 * w konkretnym roku ewentualnie przesuwa się na 28 - patrz `dzienWystapienia`). */
export function dzienPoprawny(dzien: number, miesiac: number): boolean {
  if (miesiac < 1 || miesiac > 12) return false
  return dzien >= 1 && dzien <= dniWMiesiacu(miesiac, 2000)
}

/** Dzień wystąpienia rocznicy w `rokDocelowy` - 29 lutego przesuwa się na 28
 * w latach nieprzestępnych (typowa konwencja kalendarzy), żeby rocznica nie
 * znikała na 3 lata z 4. */
function dzienWystapienia(r: Pick<Rocznica, 'dzien' | 'miesiac'>, rokDocelowy: number): number {
  if (r.miesiac === 2 && r.dzien === 29 && dniWMiesiacu(2, rokDocelowy) < 29) return 28
  return r.dzien
}

/** Odmiana "rok/lata/lat" po polsku - standardowa reguła liczebnikowa. */
function odmienLata(n: number): string {
  if (n === 1) return 'rok'
  const ostatniaCyfra = n % 10
  const ostatnieDwie = n % 100
  if (ostatniaCyfra >= 2 && ostatniaCyfra <= 4 && !(ostatnieDwie >= 12 && ostatnieDwie <= 14)) return 'lata'
  return 'lat'
}

function tytulWystapienia(r: Rocznica, rokDocelowy: number): string {
  const liczyWiek = r.typ === 'urodziny' || r.typ === 'rocznica'
  const wiek = liczyWiek && r.rok !== null ? rokDocelowy - r.rok : null
  const sufiks = wiek !== null ? ` (${wiek} ${odmienLata(wiek)})` : ''
  return `${IKONA_TYPU[r.typ]} ${NAZWA_TYPU[r.typ]} — ${r.tytul}${sufiks}`
}

/** Data samej rocznicy do wyświetlenia w tabeli, np. "8 maja" - bez roku,
 * bo rocznica powtarza się co roku niezależnie od niego. */
export function formatujDataRocznicy(dzien: number, miesiac: number): string {
  return new Date(2000, miesiac - 1, dzien).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
  })
}

/**
 * Syntetyczne całodniowe "wydarzenia" z rocznic - liczone w locie na rok
 * ubiegły/bieżący/przyszły względem `teraz`, NIGDY nie zapisywane do bazy
 * (ten sam wzorzec co `blokiSzkolne` w `vulcan.ts`). Kalendarz rozpoznaje je
 * po polu `rocznicaId` i przy kliknięciu przenosi do "Mój dom" zamiast
 * otwierać formularz edycji prawdziwego wydarzenia.
 */
export function wydarzeniaRocznic(rocznice: Rocznica[], teraz: Date = new Date()): Wydarzenie[] {
  const biezacyRok = teraz.getFullYear()
  const lata = [biezacyRok - 1, biezacyRok, biezacyRok + 1]

  const wydarzenia: Wydarzenie[] = []
  for (const r of rocznice) {
    for (const rok of lata) {
      const dzien = dzienWystapienia(r, rok)
      const start = new Date(rok, r.miesiac - 1, dzien)
      wydarzenia.push({
        id: `rocznica-${r.id}-${rok}`,
        tytul: tytulWystapienia(r, rok),
        start,
        koniec: nastepnyDzien(start),
        calodniowe: true,
        seriaId: null,
        osobyId: [],
        autorId: r.autorId,
        rocznicaId: r.id,
      })
    }
  }
  return wydarzenia
}
