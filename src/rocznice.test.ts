import { describe, expect, it } from 'vitest'
import {
  dzienPoprawny,
  formatujDataRocznicy,
  ikonaTypu,
  nazwaTypu,
  posortujRocznice,
  wydarzeniaRocznic,
  type Rocznica,
} from './rocznice'

function rocznica(zmiany: Partial<Rocznica>): Rocznica {
  return {
    id: 'r1',
    tytul: 'Zuzia',
    typ: 'urodziny',
    dzien: 8,
    miesiac: 5,
    rok: null,
    autorId: null,
    ...zmiany,
  }
}

describe('wydarzeniaRocznic', () => {
  it('zwraca trzy wystapienia (ubiegly/biezacy/przyszly rok) dla jednej rocznicy', () => {
    const wynik = wydarzeniaRocznic([rocznica({})], new Date(2026, 5, 1))
    expect(wynik).toHaveLength(3)
    expect(wynik.map((w) => w.start.getFullYear())).toEqual([2025, 2026, 2027])
  })

  it('kazde wystapienie jest calodniowe, od danego dnia do nastepnego', () => {
    const [w] = wydarzeniaRocznic([rocznica({ dzien: 8, miesiac: 5 })], new Date(2026, 0, 1))
    expect(w.calodniowe).toBe(true)
    expect(w.start).toEqual(new Date(2025, 4, 8))
    expect(w.koniec).toEqual(new Date(2025, 4, 9))
  })

  it('niesie rocznicaId, zeby kalendarz odroznil to od prawdziwego wydarzenia', () => {
    const [w] = wydarzeniaRocznic([rocznica({ id: 'abc' })], new Date(2026, 0, 1))
    expect(w.rocznicaId).toBe('abc')
    expect(w.seriaId).toBeNull()
    expect(w.osobyId).toEqual([])
  })

  it('29 lutego przesuwa sie na 28 w roku nieprzestepnym', () => {
    const wynik = wydarzeniaRocznic(
      [rocznica({ dzien: 29, miesiac: 2 })],
      new Date(2026, 0, 1), // 2025 nieprzestepny, 2026 nieprzestepny, 2027 nieprzestepny
    )
    for (const w of wynik) {
      expect(w.start.getDate()).toBe(28)
      expect(w.start.getMonth()).toBe(1) // luty = indeks 1
    }
  })

  it('29 lutego zostaje 29 w roku przestepnym', () => {
    const wynik = wydarzeniaRocznic(
      [rocznica({ dzien: 29, miesiac: 2 })],
      new Date(2027, 0, 1), // lata: 2026, 2027, 2028 - 2028 jest przestepny
    )
    const rok2028 = wynik.find((w) => w.start.getFullYear() === 2028)!
    expect(rok2028.start.getDate()).toBe(29)
  })

  it('tytul urodzin z podanym rokiem zawiera wiek', () => {
    const [, biezacy] = wydarzeniaRocznic([rocznica({ typ: 'urodziny', rok: 2016 })], new Date(2026, 0, 1))
    expect(biezacy.tytul).toBe('🎂 Urodziny — Zuzia (10 lat)')
  })

  it('tytul urodzin bez podanego roku nie zawiera wieku', () => {
    const [, biezacy] = wydarzeniaRocznic([rocznica({ typ: 'urodziny', rok: null })], new Date(2026, 0, 1))
    expect(biezacy.tytul).toBe('🎂 Urodziny — Zuzia')
  })

  it('imieniny NIGDY nie pokazuja wieku, nawet gdy rok jest podany', () => {
    const [, biezacy] = wydarzeniaRocznic([rocznica({ typ: 'imieniny', rok: 2016 })], new Date(2026, 0, 1))
    expect(biezacy.tytul).toBe('🎉 Imieniny — Zuzia')
  })

  it('rocznica slubu liczy lata tak samo jak urodziny', () => {
    const [, biezacy] = wydarzeniaRocznic(
      [rocznica({ typ: 'rocznica', tytul: 'Ślub rodziców', rok: 2011 })],
      new Date(2026, 0, 1),
    )
    expect(biezacy.tytul).toBe('💍 Rocznica — Ślub rodziców (15 lat)')
  })

  it('odmienia "rok"/"lata"/"lat" poprawnie po polsku', () => {
    const przyklady: [number, string][] = [
      [1, 'rok'],
      [2, 'lata'],
      [4, 'lata'],
      [5, 'lat'],
      [11, 'lat'],
      [12, 'lat'],
      [21, 'lat'],
      [22, 'lata'],
    ]
    for (const [wiek, oczekiwane] of przyklady) {
      const [, biezacy] = wydarzeniaRocznic(
        [rocznica({ typ: 'urodziny', rok: 2026 - wiek })],
        new Date(2026, 0, 1),
      )
      expect(biezacy.tytul).toContain(`${wiek} ${oczekiwane}`)
    }
  })

  it('nie pokazuje wystapienia sprzed podanego roku (bez ujemnego wieku)', () => {
    // 'teraz' = 2026-01-01, wiec lata do rozwazenia to 2025/2026/2027;
    // rok=2026 oznacza, ze wystapienie z 2025 jeszcze nie mialo miejsca.
    const wynik = wydarzeniaRocznic([rocznica({ typ: 'urodziny', rok: 2026 })], new Date(2026, 0, 1))
    expect(wynik.map((w) => w.start.getFullYear())).toEqual([2026, 2027])
    expect(wynik.every((w) => !w.tytul.includes('-'))).toBe(true) // brak ujemnego wieku w tytule
  })

  it('pomija dwa poprzednie wystapienia, gdy rok jest w przyszlosci', () => {
    const wynik = wydarzeniaRocznic([rocznica({ typ: 'urodziny', rok: 2027 })], new Date(2026, 0, 1))
    expect(wynik.map((w) => w.start.getFullYear())).toEqual([2027])
  })

  it('tytul dla typu "inne" nie pokazuje wieku, nawet z podanym rokiem', () => {
    const [, biezacy] = wydarzeniaRocznic(
      [rocznica({ typ: 'inne', tytul: 'Babcia - wizyta doroczna', rok: 2016 })],
      new Date(2026, 0, 1),
    )
    expect(biezacy.tytul).toBe('📌 Inne — Babcia - wizyta doroczna')
  })
})

describe('ikonaTypu i nazwaTypu', () => {
  it('maja poprawne wartosci dla wszystkich czterech typow', () => {
    expect(ikonaTypu('urodziny')).toBe('🎂')
    expect(ikonaTypu('imieniny')).toBe('🎉')
    expect(ikonaTypu('rocznica')).toBe('💍')
    expect(ikonaTypu('inne')).toBe('📌')
    expect(nazwaTypu('urodziny')).toBe('Urodziny')
    expect(nazwaTypu('imieniny')).toBe('Imieniny')
    expect(nazwaTypu('rocznica')).toBe('Rocznica')
    expect(nazwaTypu('inne')).toBe('Inne')
  })
})

describe('dzienPoprawny', () => {
  it('akceptuje zwykle daty', () => {
    expect(dzienPoprawny(8, 5)).toBe(true)
    expect(dzienPoprawny(31, 1)).toBe(true)
  })

  it('odrzuca 31 kwietnia', () => {
    expect(dzienPoprawny(31, 4)).toBe(false)
  })

  it('akceptuje 29 lutego jako wejscie (przesuniecie liczy sie osobno przy wystapieniu)', () => {
    expect(dzienPoprawny(29, 2)).toBe(true)
  })

  it('odrzuca 30 lutego', () => {
    expect(dzienPoprawny(30, 2)).toBe(false)
  })

  it('odrzuca nieprawidlowy miesiac', () => {
    expect(dzienPoprawny(1, 13)).toBe(false)
    expect(dzienPoprawny(1, 0)).toBe(false)
  })
})

describe('formatujDataRocznicy', () => {
  it('formatuje dzien i miesiac po polsku, bez roku', () => {
    expect(formatujDataRocznicy(8, 5)).toBe('8 maja')
    expect(formatujDataRocznicy(1, 1)).toBe('1 stycznia')
  })
})

describe('posortujRocznice', () => {
  it('sortuje po miesiacu, potem po dniu', () => {
    const posortowane = posortujRocznice([
      rocznica({ id: 'a', miesiac: 12, dzien: 25 }),
      rocznica({ id: 'b', miesiac: 1, dzien: 15 }),
      rocznica({ id: 'c', miesiac: 1, dzien: 1 }),
    ])
    expect(posortowane.map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })
})
