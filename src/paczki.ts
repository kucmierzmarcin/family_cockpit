import type { PaczkaDb } from './lib/supabase'
import { klucz } from './dates'

export type Paczka = {
  id: string
  memberId: string
  numer: string
  status: string
  nadawca: string | null
  punkt: string | null
  adres: string | null
  /** Termin odbioru - sedno tego ekranu. `null`, gdy API go nie podało. */
  odbierzDo: Date | null
}

export function paczkaZBazy(w: PaczkaDb): Paczka {
  return {
    id: w.id,
    memberId: w.member_id,
    numer: w.shipment_number,
    status: w.status,
    nadawca: w.sender_name,
    punkt: w.point_name,
    adres: w.point_address,
    odbierzDo: w.expiry_date ? new Date(w.expiry_date) : null,
  }
}

/**
 * Czy termin nagli: dziś, jutro albo już minął.
 *
 * Minięty też jest pilny - paczka zaraz wróci do nadawcy, więc to najgorszy
 * moment, żeby ją wyciszyć. Brak terminu pilny NIE jest: nie zmyślamy alarmu
 * z braku danych.
 */
export function czyPilna(odbierzDo: Date | null, teraz: Date): boolean {
  if (!odbierzDo) return false
  const jutro = new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() + 1)
  return klucz(odbierzDo) <= klucz(jutro)
}

/**
 * Reguła porządku dla `posortujPaczki`: najbliższy termin pierwszy, brak
 * terminu na koniec.
 *
 * Wyeksportowana osobno (nie tylko jako domknięcie wewnątrz `.sort`), żeby
 * dało się przetestować wprost własność, której `Array.prototype.sort` nie
 * ujawnia w wyniku: dwie paczki bez terminu muszą się porównać jako równe w
 * OBIE strony. Wcześniejsza, wadliwa wersja zwracała `1` w obie strony dla
 * takiej pary (łamiąc antysymetrię komparatora), a mimo to sortowanie dawało
 * tę samą, poprawną kolejność wyjściową w V8 - błąd był więc niewidoczny w
 * teście opartym wyłącznie o `posortujPaczki(...)`. Test na tej funkcji
 * bezpośrednio łapie regresję niezależnie od silnika sortującego.
 */
export function porownajTerminy(a: Paczka, b: Paczka): number {
  if (!a.odbierzDo && !b.odbierzDo) return 0
  if (!a.odbierzDo) return 1
  if (!b.odbierzDo) return -1
  return a.odbierzDo.getTime() - b.odbierzDo.getTime()
}

/** Najbliższy termin na górze; paczki bez terminu na koniec. */
export function posortujPaczki(paczki: Paczka[]): Paczka[] {
  return [...paczki].sort(porownajTerminy)
}
