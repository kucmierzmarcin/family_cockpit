import { describe, expect, it } from 'vitest'
import { ikonaRodzaju, nazwaRodzaju, posortujTerminyOdpadow, wydarzeniaOdpadow, type TerminOdbioru } from './odpady'

function termin(zmiany: Partial<TerminOdbioru>): TerminOdbioru {
  return {
    id: 't1',
    rodzaj: 'papier',
    data: '2026-05-08',
    autorId: null,
    ...zmiany,
  }
}

describe('wydarzeniaOdpadow', () => {
  it('zwraca dwa wydarzenia na termin: dzien odbioru i dzien wczesniej', () => {
    const wynik = wydarzeniaOdpadow([termin({})])
    expect(wynik).toHaveLength(2)
  })

  it('pierwsze wydarzenie to caly dzien odbioru', () => {
    const [dzienOdbioru] = wydarzeniaOdpadow([termin({ data: '2026-05-08' })])
    expect(dzienOdbioru.calodniowe).toBe(true)
    expect(dzienOdbioru.start).toEqual(new Date(2026, 4, 8))
    expect(dzienOdbioru.koniec).toEqual(new Date(2026, 4, 9))
  })

  it('drugie wydarzenie to caly dzien poprzedzajacy odbior', () => {
    const [, jutro] = wydarzeniaOdpadow([termin({ data: '2026-05-08' })])
    expect(jutro.calodniowe).toBe(true)
    expect(jutro.start).toEqual(new Date(2026, 4, 7))
    expect(jutro.koniec).toEqual(new Date(2026, 4, 8))
  })

  it('poprawnie przechodzi przez granice miesiaca', () => {
    const [, jutro] = wydarzeniaOdpadow([termin({ data: '2026-03-01' })])
    expect(jutro.start).toEqual(new Date(2026, 1, 28))
  })

  it('niesie odpadId, zeby kalendarz odroznil to od prawdziwego wydarzenia', () => {
    const [dzienOdbioru, jutro] = wydarzeniaOdpadow([termin({ id: 'abc' })])
    expect(dzienOdbioru.odpadId).toBe('abc')
    expect(jutro.odpadId).toBe('abc')
    expect(dzienOdbioru.seriaId).toBeNull()
    expect(dzienOdbioru.osobyId).toEqual([])
  })

  it('tytuly zawieraja ikone i nazwe rodzaju', () => {
    const [dzienOdbioru, jutro] = wydarzeniaOdpadow([termin({ rodzaj: 'szklo' })])
    expect(dzienOdbioru.tytul).toBe('🍾 Odbiór — Szkło')
    expect(jutro.tytul).toBe('⏰ Jutro odbiór — Szkło')
  })

  it('kazdy termin generuje wlasne wydarzenia niezaleznie', () => {
    const wynik = wydarzeniaOdpadow([
      termin({ id: 't1', data: '2026-05-08' }),
      termin({ id: 't2', data: '2026-05-22', rodzaj: 'bio' }),
    ])
    expect(wynik).toHaveLength(4)
  })
})

describe('ikonaRodzaju i nazwaRodzaju', () => {
  it('maja poprawne wartosci dla wszystkich szesciu rodzajow', () => {
    expect(ikonaRodzaju('papier')).toBe('📦')
    expect(ikonaRodzaju('szklo')).toBe('🍾')
    expect(ikonaRodzaju('plastik_metale')).toBe('♻️')
    expect(ikonaRodzaju('bio')).toBe('🍂')
    expect(ikonaRodzaju('zmieszane')).toBe('🗑️')
    expect(ikonaRodzaju('inne')).toBe('📌')
    expect(nazwaRodzaju('papier')).toBe('Papier')
    expect(nazwaRodzaju('szklo')).toBe('Szkło')
    expect(nazwaRodzaju('plastik_metale')).toBe('Plastik i metale')
    expect(nazwaRodzaju('bio')).toBe('Bio')
    expect(nazwaRodzaju('zmieszane')).toBe('Zmieszane')
    expect(nazwaRodzaju('inne')).toBe('Inne')
  })
})

describe('posortujTerminyOdpadow', () => {
  it('sortuje rosnaco po dacie', () => {
    const posortowane = posortujTerminyOdpadow([
      termin({ id: 'a', data: '2026-12-25' }),
      termin({ id: 'b', data: '2026-01-15' }),
      termin({ id: 'c', data: '2026-01-01' }),
    ])
    expect(posortowane.map((t) => t.id)).toEqual(['c', 'b', 'a'])
  })
})
