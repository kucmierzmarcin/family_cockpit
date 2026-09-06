/** Pomocnicze funkcje do dat - wszystko po polsku i bez zewnętrznych bibliotek. */

export const MIESIACE = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]

/** Tydzień zaczynamy od poniedziałku, tak jak w polskich kalendarzach. */
export const DNI_TYGODNIA = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nie']

/** Zamienia datę na tekst 'RRRR-MM-DD' w czasie lokalnym (bez przesunięcia stref). */
export function klucz(data: Date): string {
  const rok = data.getFullYear()
  const miesiac = String(data.getMonth() + 1).padStart(2, '0')
  const dzien = String(data.getDate()).padStart(2, '0')
  return `${rok}-${miesiac}-${dzien}`
}

/** 0 = poniedziałek ... 6 = niedziela (JS domyślnie daje 0 = niedziela). */
function dzienTygodniaOdPon(data: Date): number {
  return (data.getDay() + 6) % 7
}

/** Poniedziałek tygodnia, w którym leży podana data. */
export function poczatekTygodnia(data: Date): Date {
  return new Date(
    data.getFullYear(),
    data.getMonth(),
    data.getDate() - dzienTygodniaOdPon(data),
  )
}

/** Siedem kolejnych dni począwszy od poniedziałku danego tygodnia. */
export function tydzienOd(data: Date): Date[] {
  const start = poczatekTygodnia(data)
  return Array.from(
    { length: 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  )
}

/**
 * Buduje siatkę kalendarza: pełne tygodnie obejmujące cały miesiąc.
 * Dni z sąsiednich miesięcy są oznaczone `wTymMiesiacu: false`.
 */
export function siatkaMiesiaca(rok: number, miesiac: number) {
  const pierwszy = new Date(rok, miesiac, 1)
  const start = new Date(rok, miesiac, 1 - dzienTygodniaOdPon(pierwszy))

  const dni: { data: Date; wTymMiesiacu: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const data = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    dni.push({ data, wTymMiesiacu: data.getMonth() === miesiac })
  }

  // Ostatni tydzień pokazujemy tylko wtedy, gdy zawiera dni bieżącego miesiąca.
  const ostatniTydzien = dni.slice(35)
  return ostatniTydzien.some((d) => d.wTymMiesiacu) ? dni : dni.slice(0, 35)
}

/** '14:30:00' -> '14:30'; brak godziny -> null. */
export function godzina(wartosc: string | null): string | null {
  return wartosc ? wartosc.slice(0, 5) : null
}

/** Np. '6 września' - do nagłówka panelu z wydarzeniami. */
export function dlugaData(data: Date): string {
  return data.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })
}
