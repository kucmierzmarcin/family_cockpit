/**
 * Co jest w nawigacji i co robi przycisk „+" na danym ekranie.
 *
 * Czyste funkcje, bez Reacta - żeby obie powłoki (telefon i biurko) brały te
 * same odpowiedzi z jednego miejsca, a nie każda ze swojego.
 */

export type Ekran = 'dashboard' | 'kalendarz' | 'zakupy' | 'tablica' | 'terminy' | 'szkola' | 'dom'

/** Kolejność zakładek - ta sama u góry na biurku i na dole na telefonie. */
export const EKRANY: Ekran[] = ['dashboard', 'kalendarz', 'zakupy', 'tablica', 'terminy', 'szkola', 'dom']

/**
 * Dolny pasek telefonu mieści pięć celów - przy siedmiu każdy ma 51px na
 * 360-pikselowym ekranie, a samo słowo „Kalendarz” potrzebuje ~58px i nie ma
 * się gdzie złamać. Więc cztery najczęstsze ekrany stoją wprost w pasku,
 * a reszta chowa się pod „Więcej”. Na biurku zostaje cała siódemka - tam
 * miejsca nie brakuje (patrz EKRANY wyżej).
 */
export const EKRANY_TELEFON: Ekran[] = ['dashboard', 'kalendarz', 'zakupy', 'szkola']

/** Ekrany spod „Więcej” - rzadsze niż te w pasku, ale nie mniej ważne. */
export const EKRANY_WIECEJ: Ekran[] = ['tablica', 'terminy', 'dom']

/**
 * Czy zakładka „Więcej” ma świecić jako aktywna. Bez tego wejście na Tablicę
 * gasi cały pasek i nie widać już, gdzie się jest.
 */
export function wZakladceWiecej(ekran: Ekran): boolean {
  return EKRANY_WIECEJ.includes(ekran)
}

export const TYTULY: Record<Ekran, string> = {
  dashboard: 'Dziś',
  kalendarz: 'Kalendarz',
  zakupy: 'Zakupy',
  tablica: 'Tablica',
  terminy: 'Terminy',
  szkola: 'Szkoła',
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
    case 'dashboard':
      return null
    case 'kalendarz':
      return 'Dodaj wydarzenie'
    case 'zakupy':
      return 'Dodaj pozycję'
    case 'tablica':
      return 'Dodaj notatkę'
    case 'terminy':
      return 'Dodaj termin'
    case 'szkola':
      return null
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
