import type { DomownikDb } from './lib/supabase'
import { kolor, type Kolor } from './kolory'

/** Klucz filtra dla wydarzeń, których nie przypisano nikomu. */
export const BEZ_OSOBY = 'brak'

/** Barwy neutralne - dla wydarzeń bez przypisanej osoby. */
const NEUTRALNE = { tlo: '#eeedf2', tekst: '#4a4553', kropka: '#9b96a6' }

/**
 * Domownicy przypisani do wydarzenia, w kolejności, w jakiej występują w domu.
 *
 * Kolejność bierzemy z mapy domowników, a nie z tablicy identyfikatorów - dzięki
 * temu ta sama para osób zawsze daje ten sam kolor bloku, niezależnie od tego,
 * w jakiej kolejności ktoś klikał w formularzu.
 */
export function osobyWydarzenia(
  osobyId: string[],
  osobaPoId: Map<string, DomownikDb>,
): DomownikDb[] {
  if (osobyId.length === 0) return []
  const szukane = new Set(osobyId)
  return [...osobaPoId.values()].filter((d) => szukane.has(d.id))
}

/** Barwy bloku: bierzemy je od pierwszej z przypisanych osób. */
export function barwyWydarzenia(
  osobyId: string[],
  osobaPoId: Map<string, DomownikDb>,
): Kolor | typeof NEUTRALNE {
  const pierwsza = osobyWydarzenia(osobyId, osobaPoId)[0]
  return pierwsza ? kolor(pierwsza.color) : NEUTRALNE
}

/**
 * Czy wydarzenie ma się pokazać przy zadanym filtrze?
 * Wystarczy, że widoczna jest jedna z przypisanych osób - inaczej wspólny obiad
 * znikałby po ukryciu któregokolwiek uczestnika.
 */
export function widocznePrzyFiltrze(osobyId: string[], ukryci: Set<string>): boolean {
  if (osobyId.length === 0) return !ukryci.has(BEZ_OSOBY)
  return osobyId.some((id) => !ukryci.has(id))
}
