/**
 * Ile kropek zmieścić w komórce dnia, a ile zwinąć w licznik.
 *
 * Na telefonie komórka dnia ma ~32px użytecznej szerokości (390px ekranu minus
 * marginesy treści, wyściółka karty kalendarza i sześć przerw siatki, podzielone
 * na siedem kolumn). Kropka z przerwą zajmuje 10px, więc w rzędzie stoją trzy,
 * a limit 6 to dwa spokojne rzędy.
 */
export function ulozKropki(ile: number, maks: number): { pokaz: number; nadmiar: number } {
  // Jedno wydarzenie ponad limit pokazujemy mimo wszystko: licznik „+1" zajmuje
  // w rzędzie tyle samo miejsca co sama kropka, a niesie mniej informacji
  // (kropka ma jeszcze kolor osoby, licznik już nie).
  if (ile <= maks + 1) return { pokaz: ile, nadmiar: 0 }
  return { pokaz: maks, nadmiar: ile - maks }
}
