import { useSyncExternalStore } from 'react'

/**
 * Poniżej tego progu wchodzi układ telefonu. 768, a nie dzisiejsze 900:
 * tablet w pionie ma miejsce na układ biurkowy, a dolny pasek na dziesięciu
 * calach wygląda jak pomyłka.
 */
export const PROG_TELEFONU = 768

const ZAPYTANIE = `(max-width: ${PROG_TELEFONU - 1}px)`

function subskrybuj(zmiana: () => void): () => void {
  const zapytanie = window.matchMedia(ZAPYTANIE)
  zapytanie.addEventListener('change', zmiana)
  return () => zapytanie.removeEventListener('change', zmiana)
}

function czyWaski(): boolean {
  return window.matchMedia(ZAPYTANIE).matches
}

export function useTelefon(): boolean {
  // useSyncExternalStore jest zrobiony dokładnie pod subskrypcję czegoś
  // takiego jak matchMedia: React sam odpytuje `czyWaski` przy renderze i po
  // zmianie subskrypcji. Nie ma stanu, nie ma efektu, nie ma „doganiania"
  // szerokości, która zmieniła się między pierwszym renderem a nasłuchem.
  return useSyncExternalStore(subskrybuj, czyWaski)
}
