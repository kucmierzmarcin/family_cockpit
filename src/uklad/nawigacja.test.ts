import { describe, expect, it } from 'vitest'
import { EKRANY, TYTULY, etykietaDodania } from './nawigacja'

describe('EKRANY', () => {
  it('pięć ekranów w kolejności zakładek', () => {
    expect(EKRANY).toEqual(['kalendarz', 'zakupy', 'tablica', 'terminy', 'dom'])
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

  it('rola nie zmienia nic poza ekranem „Mój dom"', () => {
    for (const e of EKRANY.filter((e) => e !== 'dom')) {
      expect(etykietaDodania(e, true)).toBe(etykietaDodania(e, false))
    }
  })
})
