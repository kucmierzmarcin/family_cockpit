import { useSyncExternalStore } from 'react'

/**
 * Powyżej tego progu panel stoi obok kalendarza (patrz `.uklad` w
 * powloka.css) - tylko wtedy ma sens siatka godzin bez przewijania strony.
 * Poniżej panel i tak schodzi pod spód, więc przewijanie zostaje.
 */
const PROG_SZEROKIEGO_UKLADU = 901

const ZAPYTANIE = `(min-width: ${PROG_SZEROKIEGO_UKLADU}px)`

function subskrybuj(zmiana: () => void): () => void {
  const zapytanie = window.matchMedia(ZAPYTANIE)
  zapytanie.addEventListener('change', zmiana)
  return () => zapytanie.removeEventListener('change', zmiana)
}

function czySzeroki(): boolean {
  return window.matchMedia(ZAPYTANIE).matches
}

export function useSzerokiKalendarz(): boolean {
  return useSyncExternalStore(subskrybuj, czySzeroki)
}
