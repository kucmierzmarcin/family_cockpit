import { describe, expect, it } from 'vitest'
import { naglowekDnia, odmienWydarzenia, temat } from './podsumowanie'

function dane(ile: number) {
  return {
    dzien: '2026-09-09',
    wydarzenia: Array.from({ length: ile }, (_, i) => ({
      id: `w${i}`,
      title: `Wydarzenie ${i}`,
      starts_at: '2026-09-09T08:00:00',
      ends_at: '2026-09-09T09:00:00',
      all_day: false,
      osoby: [],
    })),
    notatki: [],
    listy: [],
  }
}

describe('odmienWydarzenia', () => {
  it('liczba pojedyncza', () => {
    expect(odmienWydarzenia(1)).toBe('1 wydarzenie')
  })

  it('dwa do czterech', () => {
    expect(odmienWydarzenia(3)).toBe('3 wydarzenia')
    expect(odmienWydarzenia(22)).toBe('22 wydarzenia')
  })

  it('pięć i więcej', () => {
    expect(odmienWydarzenia(5)).toBe('5 wydarzeń')
    expect(odmienWydarzenia(11)).toBe('11 wydarzeń')
  })

  it('nastki są wyjątkiem, mimo końcówki 2-4', () => {
    expect(odmienWydarzenia(13)).toBe('13 wydarzeń')
  })
})

describe('naglowekDnia', () => {
  it('nazwa dnia z wielkiej litery, potem data', () => {
    expect(naglowekDnia('2026-09-09')).toBe('Środa, 9 września')
  })
})

describe('temat', () => {
  it('liczy wydarzenia', () => {
    expect(temat(dane(3))).toBe('Środa, 9 września — 3 wydarzenia')
  })

  it('pusty dzień nazywa po imieniu', () => {
    expect(temat(dane(0))).toBe('Środa, 9 września — spokojny dzień')
  })
})
