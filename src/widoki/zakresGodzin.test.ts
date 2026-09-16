import { describe, expect, it } from 'vitest'
import { zakresGodzin } from './zakresGodzin'

function d(tekst: string): Date {
  return new Date(tekst)
}

describe('zakresGodzin', () => {
  it('bez wydarzeń zwraca domyślne okno 6-23', () => {
    expect(zakresGodzin([])).toEqual({ godzinaOd: 6, godzinaDo: 23 })
  })

  it('wydarzenie w obrębie domyślnego okna nie zmienia zakresu', () => {
    const wydarzenia = [{ start: d('2026-09-14T10:00'), koniec: d('2026-09-14T11:00') }]
    expect(zakresGodzin(wydarzenia)).toEqual({ godzinaOd: 6, godzinaDo: 23 })
  })

  it('wczesne wydarzenie rozszerza dolną granicę', () => {
    const wydarzenia = [{ start: d('2026-09-14T05:15'), koniec: d('2026-09-14T05:45') }]
    expect(zakresGodzin(wydarzenia)).toEqual({ godzinaOd: 5, godzinaDo: 23 })
  })

  it('późne wydarzenie rozszerza górną granicę, zaokrąglając w górę', () => {
    const wydarzenia = [{ start: d('2026-09-14T23:30'), koniec: d('2026-09-14T23:50') }]
    expect(zakresGodzin(wydarzenia)).toEqual({ godzinaOd: 6, godzinaDo: 24 })
  })
})
