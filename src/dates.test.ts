import { describe, expect, it } from 'vitest'
import { opisLiczbyWydarzen, pelnaData } from './dates'

describe('pelnaData', () => {
  it('daje dzień tygodnia, dzień, miesiąc i rok - komórka siatki nie niesie żadnego z nich', () => {
    expect(pelnaData(new Date(2026, 8, 17))).toBe('czwartek, 17 września 2026')
  })

  it('działa dla pierwszego i ostatniego dnia roku', () => {
    expect(pelnaData(new Date(2026, 0, 1))).toBe('czwartek, 1 stycznia 2026')
    expect(pelnaData(new Date(2026, 11, 31))).toBe('czwartek, 31 grudnia 2026')
  })
})

describe('opisLiczbyWydarzen', () => {
  it('odmienia po polsku, nie „5 wydarzenie"', () => {
    expect(opisLiczbyWydarzen(0)).toBe('brak wydarzeń')
    expect(opisLiczbyWydarzen(1)).toBe('1 wydarzenie')
    expect(opisLiczbyWydarzen(2)).toBe('2 wydarzenia')
    expect(opisLiczbyWydarzen(4)).toBe('4 wydarzenia')
    expect(opisLiczbyWydarzen(5)).toBe('5 wydarzeń')
  })

  it('nastolatki idą do dopełniacza, mimo końcówki 2-4', () => {
    expect(opisLiczbyWydarzen(12)).toBe('12 wydarzeń')
    expect(opisLiczbyWydarzen(13)).toBe('13 wydarzeń')
    expect(opisLiczbyWydarzen(14)).toBe('14 wydarzeń')
  })

  it('powyżej nastolatek końcówka znowu decyduje', () => {
    expect(opisLiczbyWydarzen(22)).toBe('22 wydarzenia')
    expect(opisLiczbyWydarzen(25)).toBe('25 wydarzeń')
  })
})
