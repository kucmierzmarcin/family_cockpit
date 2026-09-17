import { describe, expect, it } from 'vitest'
import { klucz } from '../dates'
import { tekstZTrasy, trasaZTekstu, type Trasa } from './trasa'

const TERAZ = new Date(2026, 8, 17, 12, 0, 0)

/** Skrót do porównań - Date nie porównuje się przez toEqual tak, jak chcemy. */
function opis(t: Trasa) {
  return { ekran: t.ekran, widok: t.widok, dzien: klucz(t.kotwica) }
}

describe('trasaZTekstu - ekrany bez kalendarza', () => {
  it('czyta slug ekranu', () => {
    expect(trasaZTekstu('#/zakupy', TERAZ).ekran).toBe('zakupy')
    expect(trasaZTekstu('#/tablica', TERAZ).ekran).toBe('tablica')
    expect(trasaZTekstu('#/terminy', TERAZ).ekran).toBe('terminy')
    expect(trasaZTekstu('#/szkola', TERAZ).ekran).toBe('szkola')
    expect(trasaZTekstu('#/dom', TERAZ).ekran).toBe('dom')
  })

  it('„Dziś" ma slug `dzis`, nie `dashboard` - adres ma mówić tym samym słowem co zakładka', () => {
    expect(trasaZTekstu('#/dzis', TERAZ).ekran).toBe('dashboard')
  })

  it('poza kalendarzem widok i data schodzą do wartości domyślnych', () => {
    expect(opis(trasaZTekstu('#/zakupy', TERAZ))).toEqual({
      ekran: 'zakupy',
      widok: 'miesiac',
      dzien: '2026-09-17',
    })
  })
})

describe('trasaZTekstu - kalendarz', () => {
  it('czyta widok i datę', () => {
    expect(opis(trasaZTekstu('#/kalendarz/tydzien/2026-10-05', TERAZ))).toEqual({
      ekran: 'kalendarz',
      widok: 'tydzien',
      dzien: '2026-10-05',
    })
    expect(opis(trasaZTekstu('#/kalendarz/dzien/2027-01-31', TERAZ))).toEqual({
      ekran: 'kalendarz',
      widok: 'dzien',
      dzien: '2027-01-31',
    })
  })

  it('sam kalendarz bez reszty to miesiąc i dzisiaj', () => {
    expect(opis(trasaZTekstu('#/kalendarz', TERAZ))).toEqual({
      ekran: 'kalendarz',
      widok: 'miesiac',
      dzien: '2026-09-17',
    })
  })

  it('data jest lokalna, nie UTC - inaczej przy dodatnim przesunięciu strefy cofa się o dzień', () => {
    const t = trasaZTekstu('#/kalendarz/dzien/2026-09-17', TERAZ)
    expect(t.kotwica.getFullYear()).toBe(2026)
    expect(t.kotwica.getMonth()).toBe(8)
    expect(t.kotwica.getDate()).toBe(17)
  })
})

describe('trasaZTekstu - śmieci', () => {
  it('pusty adres to ekran startowy', () => {
    expect(trasaZTekstu('', TERAZ).ekran).toBe('dashboard')
    expect(trasaZTekstu('#', TERAZ).ekran).toBe('dashboard')
    expect(trasaZTekstu('#/', TERAZ).ekran).toBe('dashboard')
  })

  it('nieznany ekran to ekran startowy, nie pusty ekran', () => {
    expect(trasaZTekstu('#/nie-ma-takiego', TERAZ).ekran).toBe('dashboard')
  })

  it('nieznany widok schodzi do miesiąca, reszta adresu zostaje', () => {
    expect(opis(trasaZTekstu('#/kalendarz/rok/2026-10-05', TERAZ))).toEqual({
      ekran: 'kalendarz',
      widok: 'miesiac',
      dzien: '2026-10-05',
    })
  })

  it('zła data schodzi do dzisiaj', () => {
    expect(klucz(trasaZTekstu('#/kalendarz/dzien/wczoraj', TERAZ).kotwica)).toBe('2026-09-17')
    expect(klucz(trasaZTekstu('#/kalendarz/dzien/2026-13-01', TERAZ).kotwica)).toBe('2026-09-17')
  })

  it('data nieistniejąca w kalendarzu jest odrzucana, nie przewijana na 2 marca', () => {
    expect(klucz(trasaZTekstu('#/kalendarz/dzien/2026-02-31', TERAZ).kotwica)).toBe('2026-09-17')
  })

  it('radzi sobie bez wiodącego `#` i z nadmiarowymi ukośnikami', () => {
    expect(trasaZTekstu('/zakupy', TERAZ).ekran).toBe('zakupy')
    expect(trasaZTekstu('zakupy', TERAZ).ekran).toBe('zakupy')
    expect(trasaZTekstu('#//zakupy//', TERAZ).ekran).toBe('zakupy')
  })
})

describe('tekstZTrasy', () => {
  it('ekran bez kalendarza to sam slug - bez doklejania widoku i daty', () => {
    expect(tekstZTrasy({ ekran: 'zakupy', widok: 'tydzien', kotwica: TERAZ })).toBe('#/zakupy')
    expect(tekstZTrasy({ ekran: 'dashboard', widok: 'miesiac', kotwica: TERAZ })).toBe('#/dzis')
  })

  it('kalendarz niesie widok i datę', () => {
    expect(tekstZTrasy({ ekran: 'kalendarz', widok: 'tydzien', kotwica: TERAZ })).toBe(
      '#/kalendarz/tydzien/2026-09-17',
    )
  })
})

describe('obieg tekst → trasa → tekst', () => {
  it('adres kalendarza wraca bez zmian', () => {
    for (const adres of [
      '#/kalendarz/miesiac/2026-09-17',
      '#/kalendarz/tydzien/2026-10-05',
      '#/kalendarz/dzien/2027-01-31',
    ]) {
      expect(tekstZTrasy(trasaZTekstu(adres, TERAZ))).toBe(adres)
    }
  })

  it('adres pozostałych ekranów wraca bez zmian', () => {
    for (const adres of ['#/dzis', '#/zakupy', '#/tablica', '#/terminy', '#/szkola', '#/dom']) {
      expect(tekstZTrasy(trasaZTekstu(adres, TERAZ))).toBe(adres)
    }
  })
})
