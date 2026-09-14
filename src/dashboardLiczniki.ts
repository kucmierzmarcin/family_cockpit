import { klucz } from './dates'
import { czyPrzeterminowany, type Termin } from './terminy'
import type { Wiadomosc } from './vulcan'

/** Ile terminów ma już minioną datę powiadomienia i wciąż czeka na załatwienie. */
export function liczPilneTerminy(terminy: Termin[], dzisiaj: string): number {
  return terminy.filter(
    (t) => !t.zalatwiony && t.powiadom !== null && czyPrzeterminowany(t.powiadom, dzisiaj),
  ).length
}

/** Ile wiadomości ze szkoły przyszło dzisiaj, licząc przez wszystkich uczniów łącznie.
 * Porównanie po lokalnym dniu kalendarzowym (tak samo jak w Szkola.tsx) - `dzisiaj` od
 * wywołującego pochodzi z `klucz(new Date())`, więc obie strony porównania są w tej samej,
 * lokalnej strefie czasu. */
export function liczWiadomosciDzis(wiadomosci: Wiadomosc[], dzisiaj: string): number {
  return wiadomosci.filter((w) => klucz(new Date(w.data)) === dzisiaj).length
}
