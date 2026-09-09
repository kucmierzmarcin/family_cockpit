import { klucz } from './dates'

/** Wydarzenie zajmuje przedział czasu: od `start` (włącznie) do `koniec` (wyłącznie). */
export type Przedzial = { start: Date; koniec: Date }

/** Jak często wydarzenie się powtarza. */
export type Powtarzanie = 'brak' | 'tydzien' | 'dwa-tygodnie' | 'miesiac'

export const OPISY_POWTARZANIA: Record<Powtarzanie, string> = {
  brak: 'Nie powtarzaj',
  tydzien: 'Co tydzień',
  'dwa-tygodnie': 'Co dwa tygodnie',
  miesiac: 'Co miesiąc',
}

/** Bezpiecznik: tyle wystąpień maksymalnie generujemy dla jednej serii. */
const MAKS_WYSTAPIEN = 400

/** Północ dnia, w którym leży podana chwila. */
export function poczatekDnia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Północ następnego dnia. */
export function nastepnyDzien(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

/**
 * Czy przedział wydarzenia zachodzi na zakres [od, doKiedy)?
 * Oba końce są wyłączne, więc wydarzenie kończące się dokładnie o północy
 * nie wpada do dnia następnego.
 */
export function nachodzi(w: Przedzial, od: Date, doKiedy: Date): boolean {
  return w.start < doKiedy && w.koniec > od
}

/**
 * Dni, które wydarzenie zajmuje, jako klucze 'RRRR-MM-DD'.
 * Opcjonalny zakres przycina wynik do tego, co widać na ekranie.
 */
export function dniWydarzenia(w: Przedzial, od?: Date, doKiedy?: Date): string[] {
  const start = od && od > w.start ? od : w.start
  const koniec = doKiedy && doKiedy < w.koniec ? doKiedy : w.koniec
  if (koniec <= start) return []

  // Cofamy się o milisekundę, żeby koniec o północy należał do dnia poprzedniego.
  const ostatni = poczatekDnia(new Date(koniec.getTime() - 1))

  const dni: string[] = []
  let biezacy = poczatekDnia(start)
  while (biezacy <= ostatni) {
    dni.push(klucz(biezacy))
    biezacy = nastepnyDzien(biezacy)
  }
  return dni
}

/** Czy wydarzenie mieści się w jednej dobie? */
export function wJednymDniu(w: Przedzial): boolean {
  return dniWydarzenia(w).length <= 1
}

/**
 * Data w formacie kolumny `timestamp` bez strefy: 'RRRR-MM-DDTGG:MM:SS'.
 * Celowo NIE toISOString() - ten przeliczyłby czas lokalny na UTC i przesunął
 * wydarzenia o godzinę lub dwie.
 */
export function naTimestamp(d: Date): string {
  const dwa = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${dwa(d.getMonth() + 1)}-${dwa(d.getDate())}` +
    `T${dwa(d.getHours())}:${dwa(d.getMinutes())}:${dwa(d.getSeconds())}`
  )
}

/**
 * Odczyt kolumny `timestamp` z bazy. Wartość nie niesie strefy, więc czytamy ją
 * jako czas lokalny - dopisanie 'Z' albo offsetu przesunęłoby wydarzenie.
 */
export function zTimestampu(wartosc: string): Date {
  const bezStrefy = wartosc.replace(' ', 'T').replace(/(Z|[+-]\d{2}:?\d{2})$/, '')
  return new Date(bezStrefy)
}

/** Skleja datę 'RRRR-MM-DD' i godzinę 'GG:MM' w jedną chwilę czasu lokalnego. */
export function zloz(data: string, godzina: string): Date {
  const [rok, miesiac, dzien] = data.split('-').map(Number)
  const [g, m] = godzina.split(':').map(Number)
  return new Date(rok, miesiac - 1, dzien, g || 0, m || 0)
}

/** Minuty od północy - do pozycjonowania bloku w siatce godzin. */
export function minutyOdPolnocy(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** 'GG:MM' */
export function godzinaHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 'D.MM' - dzień bez zera wiodącego, miesiąc z zerem. */
function dzienMiesiac(d: Date): string {
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Czytelny opis czasu wydarzenia, dopasowany do jego rodzaju. */
export function opisCzasu(w: Przedzial, calodniowe: boolean): string {
  // Ostatni zajęty dzień - koniec jest wyłączny, więc cofamy się o milisekundę.
  const ostatniDzien = new Date(w.koniec.getTime() - 1)

  if (calodniowe) {
    return wJednymDniu(w)
      ? 'cały dzień'
      : `${dzienMiesiac(w.start)}–${dzienMiesiac(ostatniDzien)}`
  }

  if (wJednymDniu(w)) {
    return `${godzinaHM(w.start)}–${godzinaHM(w.koniec)}`
  }

  return `${dzienMiesiac(w.start)} ${godzinaHM(w.start)} – ${dzienMiesiac(w.koniec)} ${godzinaHM(w.koniec)}`
}

/**
 * Rozwija serię na konkretne wystąpienia, zachowując długość wydarzenia.
 * Powtarzanie miesięczne pomija miesiące, które nie mają danego dnia
 * (31 stycznia nie przenosi się na 28 lutego - to dawałoby niespodzianki).
 */
export function seria(
  start: Date,
  koniec: Date,
  powtarzanie: Powtarzanie,
  doKiedy: Date,
): Przedzial[] {
  if (powtarzanie === 'brak') return [{ start, koniec }]

  const dlugosc = koniec.getTime() - start.getTime()
  const wystapienia: Przedzial[] = []

  const kolejny = (i: number): Date =>
    powtarzanie === 'miesiac'
      ? new Date(
          start.getFullYear(),
          start.getMonth() + i,
          start.getDate(),
          start.getHours(),
          start.getMinutes(),
        )
      : new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate() + i * (powtarzanie === 'tydzien' ? 7 : 14),
          start.getHours(),
          start.getMinutes(),
        )

  for (let i = 0; wystapienia.length < MAKS_WYSTAPIEN; i++) {
    const kandydat = kolejny(i)
    if (kandydat > doKiedy) break

    // Przy powtarzaniu miesięcznym JS przewija brakujący dzień na następny
    // miesiąc (31 lutego -> 3 marca). Taki miesiąc pomijamy.
    if (powtarzanie === 'miesiac' && kandydat.getDate() !== start.getDate()) continue

    wystapienia.push({ start: kandydat, koniec: new Date(kandydat.getTime() + dlugosc) })
  }

  return wystapienia
}

/**
 * Rozkłada nakładające się wydarzenia na kolumny, żeby żadne nie zasłaniało
 * drugiego. Wydarzenia stykające się końcami (jedno kończy się, gdy drugie
 * zaczyna) nie liczą się jako nakładające i dostają pełną szerokość.
 * Kolejność wyniku odpowiada kolejności wejścia.
 */
export function ukladajKolumny<T extends Przedzial>(
  lista: T[],
): (T & { kolumna: number; kolumn: number })[] {
  const przydzial = new Map<T, { kolumna: number; kolumn: number }>()
  const posortowane = [...lista].sort((a, b) => a.start.getTime() - b.start.getTime())

  let grupa: T[] = []
  let koniecGrupy = -Infinity

  // Grupa to ciąg wydarzeń połączonych nakładaniem. Kolumny liczymy w jej obrębie,
  // żeby jedno długie wydarzenie nie zwężało całego dnia.
  function zamknijGrupe() {
    if (grupa.length === 0) return

    const kolumny: T[][] = []
    for (const element of grupa) {
      let gdzie = kolumny.findIndex((k) => k[k.length - 1].koniec <= element.start)
      if (gdzie === -1) {
        kolumny.push([element])
        gdzie = kolumny.length - 1
      } else {
        kolumny[gdzie].push(element)
      }
      przydzial.set(element, { kolumna: gdzie, kolumn: 0 })
    }

    for (const element of grupa) przydzial.get(element)!.kolumn = kolumny.length

    grupa = []
    koniecGrupy = -Infinity
  }

  for (const element of posortowane) {
    if (grupa.length > 0 && element.start.getTime() >= koniecGrupy) zamknijGrupe()
    grupa.push(element)
    koniecGrupy = Math.max(koniecGrupy, element.koniec.getTime())
  }
  zamknijGrupe()

  return lista.map((element) => ({ ...element, ...przydzial.get(element)! }))
}
