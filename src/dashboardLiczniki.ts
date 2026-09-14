import { czyPrzeterminowany, type Termin } from './terminy'
import type { Wiadomosc } from './vulcan'

/** Ile terminów ma już minioną datę powiadomienia i wciąż czeka na załatwienie. */
export function liczPilneTerminy(terminy: Termin[], dzisiaj: string): number {
  return terminy.filter(
    (t) => !t.zalatwiony && t.powiadom !== null && czyPrzeterminowany(t.powiadom, dzisiaj),
  ).length
}

/** Ile wiadomości ze szkoły przyszło dzisiaj, licząc przez wszystkich uczniów łącznie.
 * Porównanie po pierwszych 10 znakach `data` (UTC 'RRRR-MM-DD' z Postgresa), a nie przez
 * `klucz(new Date(...))` - to drugie liczy dzień w lokalnej strefie urządzenia i w Polsce
 * (UTC+1/UTC+2) potrafi przesunąć wiadomości sprzed północy UTC na "dzisiaj". */
export function liczWiadomosciDzis(wiadomosci: Wiadomosc[], dzisiaj: string): number {
  return wiadomosci.filter((w) => w.data.slice(0, 10) === dzisiaj).length
}
