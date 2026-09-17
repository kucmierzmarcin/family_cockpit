import { describe, expect, it } from 'vitest'
import {
  EKRANY,
  EKRANY_TELEFON,
  EKRANY_WIECEJ,
  TYTULY,
  etykietaDodania,
  wZakladceWiecej,
} from './nawigacja'

describe('EKRANY', () => {
  it('osiem ekranów w kolejności zakładek, dashboard pierwszy', () => {
    expect(EKRANY).toEqual([
      'dashboard',
      'kalendarz',
      'zakupy',
      'tablica',
      'terminy',
      'szkola',
      'paczki',
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

describe('podział nawigacji na telefonie', () => {
  it('dolny pasek ma najwyżej pięć celów, licząc „Więcej"', () => {
    expect(EKRANY_TELEFON.length + 1).toBeLessThanOrEqual(5)
  })

  it('razem z „Więcej" obejmuje wszystkie ekrany, bez powtórek', () => {
    expect([...EKRANY_TELEFON, ...EKRANY_WIECEJ].sort()).toEqual([...EKRANY].sort())
  })

  it('zaczyna od „Dziś" - to ekran startowy', () => {
    expect(EKRANY_TELEFON[0]).toBe('dashboard')
  })

  it('zakładka „Więcej" świeci się, gdy jesteśmy na schowanym pod nią ekranie', () => {
    for (const e of EKRANY_WIECEJ) expect(wZakladceWiecej(e)).toBe(true)
    for (const e of EKRANY_TELEFON) expect(wZakladceWiecej(e)).toBe(false)
  })

  it('„Paczki" chowają się pod „Więcej" - pasek ma komplet pięciu celów', () => {
    expect(EKRANY_WIECEJ).toContain('paczki')
    expect(EKRANY_TELEFON).not.toContain('paczki')
  })
})
