import { describe, expect, it } from 'vitest'
import { EKRANY, TYTULY, etykietaDodania } from './nawigacja'

describe('EKRANY', () => {
  it('siedem ekranów w kolejności zakładek, dashboard pierwszy', () => {
    expect(EKRANY).toEqual([
      'dashboard',
      'kalendarz',
      'zakupy',
      'tablica',
      'terminy',
      'szkola',
      'dom',
    ])
  })

  it('każdy ekran ma tytuł', () => {
    for (const e of EKRANY) {
      expect(TYTULY[e]).toBeTruthy()
    }
  })
})

describe('etykietaDodania', () => {
  it('mówi, co doda przycisk na danym ekranie', () => {
    expect(etykietaDodania('kalendarz', false)).toBe('Dodaj wydarzenie')
    expect(etykietaDodania('zakupy', false)).toBe('Dodaj pozycję')
    expect(etykietaDodania('tablica', false)).toBe('Dodaj notatkę')
    expect(etykietaDodania('terminy', false)).toBe('Dodaj termin')
  })

  it('domownika dodaje tylko rodzic', () => {
    expect(etykietaDodania('dom', true)).toBe('Dodaj domownika')
    expect(etykietaDodania('dom', false)).toBeNull()
  })

  it('ekran „Szkoła" jest wyłącznie do odczytu', () => {
    expect(etykietaDodania('szkola', true)).toBeNull()
    expect(etykietaDodania('szkola', false)).toBeNull()
  })

  it('ekran „Dziś" jest wyłącznie do odczytu', () => {
    expect(etykietaDodania('dashboard', true)).toBeNull()
    expect(etykietaDodania('dashboard', false)).toBeNull()
  })

  it('rola nie zmienia nic poza ekranem „Mój dom"', () => {
    for (const e of EKRANY.filter((e) => e !== 'dom')) {
      expect(etykietaDodania(e, true)).toBe(etykietaDodania(e, false))
    }
  })
})
