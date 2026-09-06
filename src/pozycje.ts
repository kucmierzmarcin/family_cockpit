/** Pozycja listy zakupów w postaci, z którą pracuje ekran. */
export type Pozycja = {
  id: string
  listaId: string
  nazwa: string
  ilosc: string | null
  kupione: boolean
  autorId: string | null
  dodano: string
}

/** Lista zakupów. */
export type Lista = {
  id: string
  nazwa: string
}

/**
 * Porządek na liście: najpierw to, co jeszcze trzeba kupić, potem odhaczone.
 * W obu grupach kolejność dopisywania - dzięki temu pozycja nie skacze po
 * ekranie, gdy ktoś inny odhaczy coś powyżej.
 */
export function posortujPozycje<T extends { kupione: boolean; dodano: string }>(
  pozycje: T[],
): T[] {
  return [...pozycje].sort((a, b) => {
    if (a.kupione !== b.kupione) return a.kupione ? 1 : -1
    return a.dodano.localeCompare(b.dodano)
  })
}

/** Ile pozycji zostało do kupienia. */
export function policzPozostale(pozycje: { kupione: boolean }[]): number {
  return pozycje.filter((p) => !p.kupione).length
}

/** Czy jest co czyścić - steruje dostępnością przycisku "Wyczyść odhaczone". */
export function saOdhaczone(pozycje: { kupione: boolean }[]): boolean {
  return pozycje.some((p) => p.kupione)
}
