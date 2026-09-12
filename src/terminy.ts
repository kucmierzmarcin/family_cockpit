/** Ważny termin do zalatwienia (np. wygasajace ubezpieczenie), z opcjonalnymi zalacznikami. */
export type Zalacznik = {
  id: string
  nazwaPliku: string
  sciezka: string
  typ: string
  rozmiar: number
  autorId: string | null
}

export type Termin = {
  id: string
  tytul: string
  opis: string | null
  termin: string // 'RRRR-MM-DD'
  zalatwiony: boolean
  autorId: string | null
  dodano: string
  zalaczniki: Zalacznik[]
}

export const DOZWOLONE_TYPY_ZALACZNIKA = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAKS_ROZMIAR_ZALACZNIKA = 10 * 1024 * 1024

/** Terminy rosnaco po dacie - najpilniejszy pierwszy. */
export function posortujTerminy<T extends { termin: string }>(terminy: T[]): T[] {
  return [...terminy].sort((a, b) => a.termin.localeCompare(b.termin))
}

/** Czy termin juz minal - obie daty jako 'RRRR-MM-DD', porownanie tekstowe wystarcza. */
export function czyPrzeterminowany(termin: string, dzisiaj: string): boolean {
  return termin < dzisiaj
}

/** Np. '1 grudnia 2026'. Buduje Date z czesci roku/miesiaca/dnia, nie z gotowego
 * stringa - inaczej parsowanie jako UTC mogloby przesunac dzien w formatowaniu. */
export function formatujTermin(dataStr: string): string {
  const [rok, miesiac, dzien] = dataStr.split('-').map(Number)
  return new Date(rok, miesiac - 1, dzien).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Sprawdza plik przed wyslaniem - to samo ogranicza bucket w Storage, ale
 * lepiej powiedziec od razu, niz czekac na odrzucenie przez serwer. */
export function bladZalacznika(plik: { type: string; size: number }): string | null {
  if (!DOZWOLONE_TYPY_ZALACZNIKA.includes(plik.type)) {
    return 'Dozwolone są tylko zdjęcia (JPG/PNG/WebP) i pliki PDF.'
  }
  if (plik.size > MAKS_ROZMIAR_ZALACZNIKA) {
    return 'Plik jest za duży (maks. 10 MB).'
  }
  return null
}
