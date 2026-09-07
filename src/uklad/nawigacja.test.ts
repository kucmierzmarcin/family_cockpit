import { describe, expect, it } from 'vitest'
import { EKRANY, TYTULY, etykietaDodania } from './nawigacja'

describe('EKRANY', () => {
  it('cztery ekrany w kolejności zakładek', () => {
    expect(EKRANY).toEqual(['kalendarz', 'zakupy', 'tablica', 'dom'])
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
  })

  it('domownika dodaje tylko rodzic', () => {
    expect(etykietaDodania('dom', true)).toBe('Dodaj domownika')
    expect(etykietaDodania('dom', false)).toBeNull()
  })

  it('rola nie zmienia nic poza ekranem „Mój dom"', () => {
    for (const e of ['kalendarz', 'zakupy', 'tablica'] as const) {
      expect(etykietaDodania(e, true)).toBe(etykietaDodania(e, false))
    }
  })
})
