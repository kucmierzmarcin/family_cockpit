import { describe, expect, it } from 'vitest'
import {
  WSPOLNE,
  budujZapytanieBota,
  etykietaDnia,
  nastepnyDzien,
  opisPropozycji,
  rozpoznajOdpowiedz,
  rozpoznajPotwierdzenie,
  zlozTimestamp,
} from './botAI'

describe('budujZapytanieBota', () => {
  it('zawiera wiadomosc uzytkownika i liste domownikow w instrukcji systemowej', () => {
    const z = budujZapytanieBota(new Date('2026-09-11T10:00:00'), ['Marcin', 'Magda'], 'co mam jutro?')
    expect(z.contents[0].parts[0].text).toBe('co mam jutro?')
    expect(z.systemInstruction.parts[0].text).toContain('Marcin, Magda')
  })

  it('wymusza wybor jednego z trzech narzedzi', () => {
    const z = budujZapytanieBota(new Date('2026-09-11T10:00:00'), [], 'test')
    const nazwy = z.tools[0].functionDeclarations.map((n: { name: string }) => n.name)
    expect(nazwy).toEqual(['pokaz_podsumowanie', 'zaproponuj_wydarzenie', 'odpowiedz_tekstem'])
    expect(z.toolConfig.functionCallingConfig.mode).toBe('ANY')
  })
})

describe('rozpoznajOdpowiedz - pokaz_podsumowanie', () => {
  it('poprawna data', () => {
    const w = rozpoznajOdpowiedz({ nazwa: 'pokaz_podsumowanie', args: { data: '2026-09-16' } }, [])
    expect(w).toEqual({ rodzaj: 'podsumowanie', data: '2026-09-16' })
  })

  it('odrzuca nieprawidlowa date', () => {
    expect(() =>
      rozpoznajOdpowiedz({ nazwa: 'pokaz_podsumowanie', args: { data: 'nie-data' } }, []),
    ).toThrow('Nieprawidłowa data')
  })
})

describe('rozpoznajOdpowiedz - zaproponuj_wydarzenie', () => {
  const argumenty = {
    tytul: 'Dentysta',
    czlonek: 'Marcin',
    data: '2026-09-18',
    start: '15:00',
    koniec: '16:00',
    calodniowe: false,
  }

  it('domownik z listy', () => {
    const w = rozpoznajOdpowiedz({ nazwa: 'zaproponuj_wydarzenie', args: argumenty }, ['Marcin', 'Magda'])
    expect(w).toEqual({ rodzaj: 'wydarzenie', wydarzenie: argumenty })
  })

  it('akceptuje Wspólne jako czlonka', () => {
    const w = rozpoznajOdpowiedz(
      { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, czlonek: WSPOLNE } },
      ['Marcin'],
    )
    expect(w.rodzaj).toBe('wydarzenie')
  })

  it('odrzuca osobe spoza listy domownikow', () => {
    expect(() =>
      rozpoznajOdpowiedz(
        { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, czlonek: 'Ktoś Obcy' } },
        ['Marcin'],
      ),
    ).toThrow('nieznaną osobę')
  })

  it('odrzuca nieprawidlowa date', () => {
    expect(() =>
      rozpoznajOdpowiedz(
        { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, data: 'nie-data' } },
        ['Marcin'],
      ),
    ).toThrow('Nieprawidłowa data')
  })

  it('odrzuca brak tytulu', () => {
    expect(() =>
      rozpoznajOdpowiedz(
        { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, tytul: '   ' } },
        ['Marcin'],
      ),
    ).toThrow('tytułu')
  })

  it('odrzuca koniec nie pozniejszy niz poczatek', () => {
    expect(() =>
      rozpoznajOdpowiedz(
        { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, start: '11:00', koniec: '10:00' } },
        ['Marcin'],
      ),
    ).toThrow('późniejszy')
  })

  it('calodniowe pomija sprawdzenie kolejnosci godzin', () => {
    const w = rozpoznajOdpowiedz(
      { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, calodniowe: true, start: '00:00', koniec: '00:00' } },
      ['Marcin'],
    )
    expect(w.rodzaj).toBe('wydarzenie')
  })
})

describe('rozpoznajOdpowiedz - odpowiedz_tekstem i bledy', () => {
  it('zwraca tresc', () => {
    const w = rozpoznajOdpowiedz({ nazwa: 'odpowiedz_tekstem', args: { tresc: 'Cześć!' } }, [])
    expect(w).toEqual({ rodzaj: 'tekst', tresc: 'Cześć!' })
  })

  it('pusta tresc dostaje domyslny tekst', () => {
    const w = rozpoznajOdpowiedz({ nazwa: 'odpowiedz_tekstem', args: { tresc: '' } }, [])
    expect(w).toEqual({ rodzaj: 'tekst', tresc: 'Nie jestem pewien, o co pytasz.' })
  })

  it('nieznane narzedzie rzuca blad', () => {
    expect(() => rozpoznajOdpowiedz({ nazwa: 'cos_innego', args: {} }, [])).toThrow('Nieznane narzędzie')
  })
})

describe('rozpoznajPotwierdzenie', () => {
  it('rozpoznaje "tak" niezaleznie od wielkosci liter i spacji', () => {
    expect(rozpoznajPotwierdzenie('Tak')).toBe('tak')
    expect(rozpoznajPotwierdzenie('  tak  ')).toBe('tak')
    expect(rozpoznajPotwierdzenie('OK')).toBe('tak')
  })

  it('rozpoznaje "nie"', () => {
    expect(rozpoznajPotwierdzenie('nie')).toBe('nie')
    expect(rozpoznajPotwierdzenie('anuluj')).toBe('nie')
  })

  it('cokolwiek innego jest niejasne', () => {
    expect(rozpoznajPotwierdzenie('a moze pojutrze')).toBe('niejasne')
  })
})

describe('etykietaDnia', () => {
  it('dzisiejsza data dostaje etykiete DZIS', () => {
    expect(etykietaDnia('2026-09-11', new Date('2026-09-11T10:00:00'))).toBe('DZIŚ W KALENDARZU')
  })

  it('jutrzejsza data dostaje etykiete JUTRO', () => {
    expect(etykietaDnia('2026-09-12', new Date('2026-09-11T10:00:00'))).toBe('JUTRO W KALENDARZU')
  })

  it('inny dzien dostaje pelna nazwe dnia i date', () => {
    expect(etykietaDnia('2026-09-16', new Date('2026-09-11T10:00:00'))).toBe('ŚRODA, 16 WRZEŚNIA W KALENDARZU')
  })

  it('dzien z przeszlosci tez dostaje pelna nazwe (nie jest ani dzis ani jutro)', () => {
    expect(etykietaDnia('2026-09-01', new Date('2026-09-11T10:00:00'))).toBe('WTOREK, 1 WRZEŚNIA W KALENDARZU')
  })
})

describe('nastepnyDzien', () => {
  it('dodaje jeden dzien', () => {
    expect(nastepnyDzien('2026-09-30')).toBe('2026-10-01')
  })
})

describe('zlozTimestamp', () => {
  it('laczy date i godzine w format bazy', () => {
    expect(zlozTimestamp('2026-09-18', '15:00')).toBe('2026-09-18T15:00:00')
  })
})

describe('opisPropozycji', () => {
  it('wydarzenie godzinowe z osoba', () => {
    expect(
      opisPropozycji({ tytul: 'Dentysta', czlonek: 'Marcin', data: '2026-09-18', start: '15:00', koniec: '16:00', calodniowe: false }),
    ).toBe('Dentysta (Marcin) — 2026-09-18, 15:00–16:00')
  })

  it('wydarzenie calodniowe, wspolne (bez osoby w nawiasie)', () => {
    expect(
      opisPropozycji({ tytul: 'Wycieczka', czlonek: WSPOLNE, data: '2026-09-20', start: '00:00', koniec: '23:59', calodniowe: true }),
    ).toBe('Wycieczka — 2026-09-20 (cały dzień)')
  })
})
