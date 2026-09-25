/**
 * Terminy odbioru odpadów - pojedyncze, konkretne daty (NIE reguła
 * powtarzania - harmonogram gminy przesuwa się przez święta, więc "co N
 * tygodni" by się rozjechało). Dla każdego terminu kalendarz dostaje dwa
 * syntetyczne całodniowe "wydarzenia", liczone w locie i NIGDY nie zapisywane
 * do bazy (ten sam wzorzec co `wydarzeniaRocznic` w rocznice.ts): jedno w
 * dniu odbioru, jedno dzień wcześniej jako przypomnienie. Kalendarz rozpoznaje
 * je po polu `odpadId` i przy kliknięciu przenosi do "Mój dom" zamiast
 * otwierać formularz edycji prawdziwego wydarzenia.
 */
import { nastepnyDzien, poprzedniDzien } from './czas'
import type { Wydarzenie } from './useWydarzenia'

export type RodzajOdpadow = 'papier' | 'szklo' | 'plastik_metale' | 'bio' | 'zmieszane' | 'inne'

export type TerminOdbioru = {
  id: string
  rodzaj: RodzajOdpadow
  /** 'RRRR-MM-DD' - dzień odbioru. */
  data: string
  autorId: string | null
}

export const OPCJE_RODZAJU: { wartosc: RodzajOdpadow; etykieta: string }[] = [
  { wartosc: 'papier', etykieta: 'Papier' },
  { wartosc: 'szklo', etykieta: 'Szkło' },
  { wartosc: 'plastik_metale', etykieta: 'Plastik i metale' },
  { wartosc: 'bio', etykieta: 'Bio' },
  { wartosc: 'zmieszane', etykieta: 'Zmieszane' },
  { wartosc: 'inne', etykieta: 'Inne' },
]

const IKONA_RODZAJU: Record<RodzajOdpadow, string> = {
  papier: '📦',
  szklo: '🍾',
  plastik_metale: '♻️',
  bio: '🍂',
  zmieszane: '🗑️',
  inne: '📌',
}

const NAZWA_RODZAJU: Record<RodzajOdpadow, string> = {
  papier: 'Papier',
  szklo: 'Szkło',
  plastik_metale: 'Plastik i metale',
  bio: 'Bio',
  zmieszane: 'Zmieszane',
  inne: 'Inne',
}

export function ikonaRodzaju(rodzaj: RodzajOdpadow): string {
  return IKONA_RODZAJU[rodzaj]
}

export function nazwaRodzaju(rodzaj: RodzajOdpadow): string {
  return NAZWA_RODZAJU[rodzaj]
}

/** Terminy rosnąco po dacie - najbliższy pierwszy. */
export function posortujTerminyOdpadow<T extends { data: string }>(terminy: T[]): T[] {
  return [...terminy].sort((a, b) => a.data.localeCompare(b.data))
}

/** Buduje `Date` z 'RRRR-MM-DD' jako północ czasu lokalnego - inaczej parsowanie
 * jako UTC mogłoby przesunąć dzień (patrz `formatujTermin` w terminy.ts). */
function dataZTekstu(dataStr: string): Date {
  const [rok, miesiac, dzien] = dataStr.split('-').map(Number)
  return new Date(rok, miesiac - 1, dzien)
}

export function wydarzeniaOdpadow(terminy: TerminOdbioru[]): Wydarzenie[] {
  const wydarzenia: Wydarzenie[] = []
  for (const t of terminy) {
    const dzienOdbioru = dataZTekstu(t.data)
    wydarzenia.push({
      id: `odpady-${t.id}-dzien`,
      tytul: `${IKONA_RODZAJU[t.rodzaj]} Odbiór — ${NAZWA_RODZAJU[t.rodzaj]}`,
      start: dzienOdbioru,
      koniec: nastepnyDzien(dzienOdbioru),
      calodniowe: true,
      seriaId: null,
      osobyId: [],
      autorId: t.autorId,
      odpadId: t.id,
    })
    wydarzenia.push({
      id: `odpady-${t.id}-jutro`,
      tytul: `⏰ Jutro odbiór — ${NAZWA_RODZAJU[t.rodzaj]}`,
      start: poprzedniDzien(dzienOdbioru),
      koniec: dzienOdbioru,
      calodniowe: true,
      seriaId: null,
      osobyId: [],
      autorId: t.autorId,
      odpadId: t.id,
    })
  }
  return wydarzenia
}
