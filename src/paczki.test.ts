import { describe, expect, it } from 'vitest'
import { czyPilna, porownajTerminy, posortujPaczki, type Paczka } from './paczki'

const TERAZ = new Date(2026, 8, 17, 10, 0)
const p = (numer: string, odbierzDo: Date | null): Paczka => ({
  id: numer, memberId: 'm', numer, status: 'Gotowa do odbioru',
  nadawca: null, punkt: null, adres: null, odbierzDo,
})

describe('czyPilna', () => {
  it('termin dzis jest pilny', () => {
    expect(czyPilna(new Date(2026, 8, 17, 23, 0), TERAZ)).toBe(true)
  })

  it('termin jutro jest pilny - to ostatni wieczor, zeby zdazyc', () => {
    expect(czyPilna(new Date(2026, 8, 18, 12, 0), TERAZ)).toBe(true)
  })

  it('pojutrze juz nie', () => {
    expect(czyPilna(new Date(2026, 8, 19, 12, 0), TERAZ)).toBe(false)
  })

  it('termin ktory juz minal tez jest pilny - paczka zaraz wroci do nadawcy', () => {
    expect(czyPilna(new Date(2026, 8, 16, 12, 0), TERAZ)).toBe(true)
  })

  it('brak terminu nie jest pilny - nie zmyslamy alarmu', () => {
    expect(czyPilna(null, TERAZ)).toBe(false)
  })
})

describe('posortujPaczki', () => {
  it('najblizszy termin na gorze', () => {
    const lista = [p('b', new Date(2026, 8, 20)), p('a', new Date(2026, 8, 18))]
    expect(posortujPaczki(lista).map((x) => x.numer)).toEqual(['a', 'b'])
  })

  it('paczki bez terminu ida na koniec, nie na poczatek', () => {
    const lista = [p('bez', null), p('z', new Date(2026, 8, 20))]
    expect(posortujPaczki(lista).map((x) => x.numer)).toEqual(['z', 'bez'])
  })

  it('trzy i wiecej paczek bez terminu zachowuja kolejnosc wejsciowa i ida na koniec', () => {
    const lista = [
      p('bez1', null),
      p('b', new Date(2026, 8, 20)),
      p('bez2', null),
      p('a', new Date(2026, 8, 18)),
      p('bez3', null),
      p('bez4', null),
    ]
    expect(posortujPaczki(lista).map((x) => x.numer)).toEqual([
      'a', 'b', 'bez1', 'bez2', 'bez3', 'bez4',
    ])
  })

  // Regresja: wczesniejszy komparator zwracal 1 w OBIE strony dla pary paczek
  // bez terminu (lamiac antysymetrie), co mimo to dawalo tez samo poprawne
  // wyjscie `posortujPaczki` w V8 - powyzsze testy na `.sort()` by tego nie
  // zlapaly. Ten test sprawdza sama regule porownania wprost, wiec faktycznie
  // pada przy starym komparatorze.
  it('porownajTerminy: dwie paczki bez terminu sa rowne w obie strony', () => {
    const a = p('a', null)
    const b = p('b', null)
    expect(porownajTerminy(a, b)).toBe(0)
    expect(porownajTerminy(b, a)).toBe(0)
  })
})
