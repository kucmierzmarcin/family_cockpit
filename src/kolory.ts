/** Paleta kolorów domowników - stały zestaw, żeby pigułki zawsze były czytelne. */

export type Kolor = {
  /** To trafia do bazy, w kolumnie `family_members.color`. */
  id: string
  /** Nasycony kolor kropki przy imieniu. */
  kropka: string
  /** Jasne tło pigułki w siatce kalendarza. */
  tlo: string
  /** Ciemny tekst na tym tle. */
  tekst: string
}

export const PALETA: Kolor[] = [
  { id: 'fiolet', kropka: '#7c3aed', tlo: '#f1eafe', tekst: '#4c1d95' },
  { id: 'rozowy', kropka: '#db2777', tlo: '#fce7f3', tekst: '#9d174d' },
  { id: 'bursztyn', kropka: '#d97706', tlo: '#fef3c7', tekst: '#92400e' },
  { id: 'zielony', kropka: '#059669', tlo: '#d1fae5', tekst: '#065f46' },
  { id: 'blekitny', kropka: '#0284c7', tlo: '#e0f2fe', tekst: '#075985' },
  { id: 'granatowy', kropka: '#4338ca', tlo: '#e0e7ff', tekst: '#312e81' },
  { id: 'czerwony', kropka: '#dc2626', tlo: '#fee2e2', tekst: '#991b1b' },
  { id: 'morski', kropka: '#0d9488', tlo: '#ccfbf1', tekst: '#115e59' },
]

/** Kolor po id. Nieznane id (np. z ręcznie zmienionej bazy) dostaje pierwszy z palety. */
export function kolor(id: string | null | undefined): Kolor {
  return PALETA.find((k) => k.id === id) ?? PALETA[0]
}

/**
 * Pierwszy kolor, którego nikt jeszcze nie ma - propozycja dla nowego domownika.
 * Gdy paleta się wyczerpie, zaczynamy od początku.
 */
export function wolnyKolor(zajete: string[]): string {
  return (PALETA.find((k) => !zajete.includes(k.id)) ?? PALETA[zajete.length % PALETA.length]).id
}
