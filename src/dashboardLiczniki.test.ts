import { describe, expect, it } from 'vitest'
import {
  czyPilnePaczki,
  liczNieusprawiedliwione,
  liczPaczkiDoOdbioru,
  liczPilneTerminy,
  liczWiadomosciDzis,
} from './dashboardLiczniki'
import type { Paczka } from './paczki'
import type { Termin } from './terminy'
import type { Obecnosc, Wiadomosc } from './vulcan'

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

function paczka(odbierzDo: Date | null): Paczka {
  return {
    id: 'x',
    memberId: 'm',
    numer: 'x',
    status: 'Gotowa do odbioru',
    nadawca: null,
    punkt: null,
    adres: null,
    odbierzDo,
  }
}

function obecnosc(zmiany: Partial<Obecnosc>): Obecnosc {
  return {
    id: 'id',
    uczenId: 'uczen-1',
    data: '2026-09-10',
    przedmiot: 'Matematyka',
    nazwaTypu: 'Nieobecność nieusprawiedliwiona',
    nieobecnosc: true,
    usprawiedliwiona: false,
    zwolnienie: false,
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
    expect(liczWiadomosciDzis([wiadomosc({ data: '2026-09-12T12:00:00Z' })], dzisiaj)).toBe(0)
  })

  it('liczy przez wszystkich uczniów łącznie', () => {
    const wiadomosci = [
      wiadomosc({ uczenId: 'a', data: '2026-09-14T07:00:00Z' }),
      wiadomosc({ uczenId: 'b', data: '2026-09-14T09:00:00Z' }),
    ]
    expect(liczWiadomosciDzis(wiadomosci, dzisiaj)).toBe(2)
  })
})

describe('liczNieusprawiedliwione', () => {
  it('liczy nieusprawiedliwione nieobecnosci', () => {
    expect(liczNieusprawiedliwione([obecnosc({})])).toBe(1)
  })

  it('nie liczy usprawiedliwionej ani zwolnienia', () => {
    const lista = [obecnosc({ usprawiedliwiona: true }), obecnosc({ zwolnienie: true })]
    expect(liczNieusprawiedliwione(lista)).toBe(0)
  })

  it('liczy przez wszystkich uczniow lacznie', () => {
    const lista = [obecnosc({ uczenId: 'a' }), obecnosc({ uczenId: 'b' })]
    expect(liczNieusprawiedliwione(lista)).toBe(2)
  })
})

describe('liczniki paczek', () => {
  const TERAZ = new Date(2026, 8, 17, 10, 0)

  it('liczy wszystkie czekajace paczki', () => {
    expect(liczPaczkiDoOdbioru([paczka(null), paczka(new Date(2026, 8, 25))])).toBe(2)
  })

  it('czerwony alarm tylko wtedy, gdy ktorys termin nagli', () => {
    expect(czyPilnePaczki([paczka(new Date(2026, 8, 25))], TERAZ)).toBe(false)
    expect(czyPilnePaczki([paczka(new Date(2026, 8, 18))], TERAZ)).toBe(true)
  })

  it('pusta lista nie alarmuje', () => {
    expect(czyPilnePaczki([], TERAZ)).toBe(false)
  })
})
