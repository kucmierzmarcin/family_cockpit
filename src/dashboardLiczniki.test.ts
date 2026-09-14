import { describe, expect, it } from 'vitest'
import { liczPilneTerminy, liczWiadomosciDzis } from './dashboardLiczniki'
import type { Termin } from './terminy'
import type { Wiadomosc } from './vulcan'

function termin(zmiany: Partial<Termin>): Termin {
  return {
    id: 'id',
    tytul: 'Test',
    opis: null,
    termin: '2026-09-20',
    zalatwiony: false,
    powiadom: null,
    autorId: null,
    dodano: '2026-09-01T00:00:00Z',
    zalaczniki: [],
    ...zmiany,
  }
}

function wiadomosc(zmiany: Partial<Wiadomosc>): Wiadomosc {
  return {
    id: 'id',
    uczenId: 'uczen-1',
    nadawca: 'Wychowawca',
    temat: 'Temat',
    tresc: 'Treść',
    data: '2026-09-14T08:00:00Z',
    ...zmiany,
  }
}

describe('liczPilneTerminy', () => {
  const dzisiaj = '2026-09-14'

  it('liczy termin z minioną datą powiadomienia', () => {
    expect(liczPilneTerminy([termin({ powiadom: '2026-09-13' })], dzisiaj)).toBe(1)
  })

  it('nie liczy terminu bez daty powiadomienia', () => {
    expect(liczPilneTerminy([termin({ powiadom: null })], dzisiaj)).toBe(0)
  })

  it('nie liczy terminu z powiadomieniem dopiero jutro', () => {
    expect(liczPilneTerminy([termin({ powiadom: '2026-09-15' })], dzisiaj)).toBe(0)
  })

  it('nie liczy terminu z powiadomieniem dziś - jeszcze nie minęło', () => {
    expect(liczPilneTerminy([termin({ powiadom: '2026-09-14' })], dzisiaj)).toBe(0)
  })

  it('nie liczy załatwionego terminu, nawet z minionym powiadomieniem', () => {
    expect(
      liczPilneTerminy([termin({ powiadom: '2026-09-01', zalatwiony: true })], dzisiaj),
    ).toBe(0)
  })

  it('liczy kilka pilnych naraz', () => {
    const terminy = [
      termin({ powiadom: '2026-09-01' }),
      termin({ powiadom: '2026-09-10' }),
      termin({ powiadom: null }),
    ]
    expect(liczPilneTerminy(terminy, dzisiaj)).toBe(2)
  })
})

describe('liczWiadomosciDzis', () => {
  const dzisiaj = '2026-09-14'

  it('liczy wiadomość z dzisiejszą datą', () => {
    expect(liczWiadomosciDzis([wiadomosc({ data: '2026-09-14T07:30:00Z' })], dzisiaj)).toBe(1)
  })

  it('nie liczy wiadomości sprzed wczoraj', () => {
    expect(liczWiadomosciDzis([wiadomosc({ data: '2026-09-13T22:00:00Z' })], dzisiaj)).toBe(0)
  })

  it('liczy przez wszystkich uczniów łącznie', () => {
    const wiadomosci = [
      wiadomosc({ uczenId: 'a', data: '2026-09-14T07:00:00Z' }),
      wiadomosc({ uczenId: 'b', data: '2026-09-14T09:00:00Z' }),
    ]
    expect(liczWiadomosciDzis(wiadomosci, dzisiaj)).toBe(2)
  })
})
