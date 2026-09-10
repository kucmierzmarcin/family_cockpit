import { describe, expect, it } from 'vitest'
import {
  liniaListy,
  liniaNotatki,
  liniaWydarzenia,
  naglowekDnia,
  odmienWydarzenia,
  temat,
} from './podsumowanie'

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

describe('liniaWydarzenia', () => {
  it('godzinowe: godzina, tytuł, osoby', () => {
    expect(
      liniaWydarzenia({
        id: 'a',
        title: 'Trening',
        starts_at: '2026-09-09T08:00:00',
        ends_at: '2026-09-09T09:30:00',
        all_day: false,
        osoby: [
          { id: 'o1', name: 'Ola' },
          { id: 'o2', name: 'Marek' },
        ],
      }),
    ).toBe('8:00 Trening — Ola, Marek')
  })

  it('całodniowe zamiast godziny mówi "Cały dzień"', () => {
    expect(
      liniaWydarzenia({
        id: 'b',
        title: 'Wakacje',
        starts_at: '2026-09-09T00:00:00',
        ends_at: '2026-09-12T00:00:00',
        all_day: true,
        osoby: [],
      }),
    ).toBe('Cały dzień · Wakacje')
  })

  it('bez osób nie dokleja myślnika', () => {
    expect(
      liniaWydarzenia({
        id: 'c',
        title: 'Dentysta',
        starts_at: '2026-09-09T14:05:00',
        ends_at: '2026-09-09T15:00:00',
        all_day: false,
        osoby: [],
      }),
    ).toBe('14:05 Dentysta')
  })
})

describe('liniaNotatki', () => {
  it('przypięta jest oznaczona', () => {
    expect(liniaNotatki({ id: 'n', content: 'Zebranie', pinned: true, autor: 'Marek' })).toBe(
      'Zebranie (przypięte, Marek)',
    )
  })

  it('zwykła podaje samego autora', () => {
    expect(liniaNotatki({ id: 'n', content: 'Kupiłem chleb', pinned: false, autor: 'Ola' })).toBe(
      'Kupiłem chleb (Ola)',
    )
  })
})

describe('liniaListy', () => {
  it('jedna rzecz', () => {
    expect(liniaListy({ id: 'l', name: 'Apteka', pozostalo: 1 })).toBe('Apteka — 1 rzecz')
  })

  it('więcej rzeczy', () => {
    expect(liniaListy({ id: 'l', name: 'Spożywcze', pozostalo: 4 })).toBe('Spożywcze — 4 rzeczy')
  })
})
