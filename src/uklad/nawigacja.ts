/**
 * Co jest w nawigacji i co robi przycisk „+" na danym ekranie.
 *
 * Czyste funkcje, bez Reacta - żeby obie powłoki (telefon i biurko) brały te
 * same odpowiedzi z jednego miejsca, a nie każda ze swojego.
 */

export type Ekran = 'kalendarz' | 'zakupy' | 'tablica' | 'dom'

/** Kolejność zakładek - ta sama u góry na biurku i na dole na telefonie. */
export const EKRANY: Ekran[] = ['kalendarz', 'zakupy', 'tablica', 'dom']

export const TYTULY: Record<Ekran, string> = {
  kalendarz: 'Kalendarz',
  zakupy: 'Zakupy',
  tablica: 'Tablica',
  dom: 'Mój dom',
}

/**
 * Etykieta przycisku „+", albo `null`, gdy na tym ekranie nie wolno dodawać.
 * Sam plus nie mówi czytnikowi ekranu niczego, więc etykieta jest wymagana,
 * nie ozdobna. `null` znaczy: nie pokazuj przycisku wcale - lepiej niż błąd
 * po kliknięciu.
 */
export function etykietaDodania(ekran: Ekran, jestemRodzicem: boolean): string | null {
  switch (ekran) {
    case 'kalendarz':
      return 'Dodaj wydarzenie'
    case 'zakupy':
      return 'Dodaj pozycję'
    case 'tablica':
      return 'Dodaj notatkę'
    case 'dom':
      return jestemRodzicem ? 'Dodaj domownika' : null
  }
}

/**
 * Jak ekran ma pokazać swój formularz dodawania.
 *
 * `null` - wbudowany w stronę, tak jak dziś na komputerze.
 * Obiekt - w arkuszu, sterowanym z powłoki telefonu.
 */
export type TrybDodawania = { otwarte: boolean; onZamknij: () => void } | null
