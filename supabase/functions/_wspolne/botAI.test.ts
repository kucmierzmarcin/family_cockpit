import { describe, expect, it } from 'vitest'
import {
  WSPOLNE,
  budujZapytanieBota,
  etykietaDnia,
  nastepnyDzien,
  opisPropozycji,
  opisWydarzenia,
  rozpoznajOdpowiedz,
  rozpoznajPotwierdzenie,
  zlozTimestamp,
} from './botAI'

describe('budujZapytanieBota', () => {
  it('zawiera wiadomosc uzytkownika i liste domownikow w instrukcji systemowej', () => {
    const z = budujZapytanieBota(new Date('2026-09-11T10:00:00'), ['Marcin', 'Magda'], [], 'co mam jutro?')
    expect(z.contents[0].parts[0].text).toBe('co mam jutro?')
    expect(z.systemInstruction.parts[0].text).toContain('Marcin, Magda')
  })

  it('wymusza wybor jednego z szesciu narzedzi', () => {
    const z = budujZapytanieBota(new Date('2026-09-11T10:00:00'), [], [], 'test')
    const nazwy = z.tools[0].functionDeclarations.map((n: { name: string }) => n.name)
    expect(nazwy).toEqual([
      'pokaz_podsumowanie',
      'zaproponuj_wydarzenie',
      'usun_wydarzenie',
      'dodaj_pozycje_zakupow',
      'dodaj_notatke',
      'odpowiedz_tekstem',
    ])
    expect(z.toolConfig.functionCallingConfig.mode).toBe('ANY')
  })

  it('lista zakupow trafia jako enum pola "lista", gdy istnieja jakies listy', () => {
    const z = budujZapytanieBota(new Date('2026-09-11T10:00:00'), [], ['Zakupy', 'Apteka'], 'test')
    const zakupy = z.tools[0].functionDeclarations.find(
      (n: { name: string }) => n.name === 'dodaj_pozycje_zakupow',
    )
    expect(zakupy.parameters.properties.lista.enum).toEqual(['Zakupy', 'Apteka'])
  })

  it('bez enuma pola "lista", gdy zaden dom nie ma jeszcze listy', () => {
    const z = budujZapytanieBota(new Date('2026-09-11T10:00:00'), [], [], 'test')
    const zakupy = z.tools[0].functionDeclarations.find(
      (n: { name: string }) => n.name === 'dodaj_pozycje_zakupow',
    )
    expect(zakupy.parameters.properties.lista.enum).toBeUndefined()
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

describe('rozpoznajOdpowiedz - usun_wydarzenie', () => {
  it('pelne dane (opis + data)', () => {
    const w = rozpoznajOdpowiedz(
      { nazwa: 'usun_wydarzenie', args: { opis: 'dentysta', data: '2026-09-18' } },
      [],
    )
    expect(w).toEqual({ rodzaj: 'usun_wydarzenie', opis: 'dentysta', dzien: '2026-09-18' })
  })

  it('data jest opcjonalna - brak staje sie null', () => {
    const w = rozpoznajOdpowiedz({ nazwa: 'usun_wydarzenie', args: { opis: 'trening' } }, [])
    expect(w).toEqual({ rodzaj: 'usun_wydarzenie', opis: 'trening', dzien: null })
  })

  it('odrzuca brak opisu', () => {
    expect(() =>
      rozpoznajOdpowiedz({ nazwa: 'usun_wydarzenie', args: { opis: '   ' } }, []),
    ).toThrow('opisu wydarzenia')
  })

  it('odrzuca nieprawidlowa date', () => {
    expect(() =>
      rozpoznajOdpowiedz({ nazwa: 'usun_wydarzenie', args: { opis: 'trening', data: 'nie-data' } }, []),
    ).toThrow('Nieprawidłowa data')
  })
})

describe('rozpoznajOdpowiedz - dodaj_pozycje_zakupow', () => {
  it('pelne dane', () => {
    const w = rozpoznajOdpowiedz(
      { nazwa: 'dodaj_pozycje_zakupow', args: { nazwa: 'Mleko', ilosc: '1 l', lista: 'Zakupy' } },
      [],
    )
    expect(w).toEqual({ rodzaj: 'zakupy', pozycja: { nazwa: 'Mleko', ilosc: '1 l', lista: 'Zakupy' } })
  })

  it('ilosc i lista sa opcjonalne - brak staje sie null', () => {
    const w = rozpoznajOdpowiedz({ nazwa: 'dodaj_pozycje_zakupow', args: { nazwa: 'Chleb' } }, [])
    expect(w).toEqual({ rodzaj: 'zakupy', pozycja: { nazwa: 'Chleb', ilosc: null, lista: null } })
  })

  it('odrzuca brak nazwy pozycji', () => {
    expect(() =>
      rozpoznajOdpowiedz({ nazwa: 'dodaj_pozycje_zakupow', args: { nazwa: '   ' } }, []),
    ).toThrow('nazwy pozycji')
  })
})

describe('rozpoznajOdpowiedz - dodaj_notatke', () => {
  it('pelne dane', () => {
    const w = rozpoznajOdpowiedz(
      { nazwa: 'dodaj_notatke', args: { tresc: 'Kupić kwiaty na urodziny', przypieta: true } },
      [],
    )
    expect(w).toEqual({ rodzaj: 'notatka', notatka: { tresc: 'Kupić kwiaty na urodziny', przypieta: true } })
  })

  it('przypieta domyslnie false', () => {
    const w = rozpoznajOdpowiedz({ nazwa: 'dodaj_notatke', args: { tresc: 'Zadzwonić do babci' } }, [])
    expect(w).toEqual({ rodzaj: 'notatka', notatka: { tresc: 'Zadzwonić do babci', przypieta: false } })
  })

  it('odrzuca brak tresci notatki', () => {
    expect(() => rozpoznajOdpowiedz({ nazwa: 'dodaj_notatke', args: { tresc: '  ' } }, [])).toThrow(
      'treści notatki',
    )
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

describe('opisWydarzenia', () => {
  it('wydarzenie godzinowe', () => {
    expect(
      opisWydarzenia({
        title: 'Dentysta',
        starts_at: '2026-09-18T15:00:00',
        ends_at: '2026-09-18T16:00:00',
        all_day: false,
      }),
    ).toBe('Dentysta — 2026-09-18, 15:00–16:00')
  })

  it('wydarzenie calodniowe', () => {
    expect(
      opisWydarzenia({
        title: 'Wycieczka',
        starts_at: '2026-09-20T00:00:00',
        ends_at: '2026-09-23T00:00:00',
        all_day: true,
      }),
    ).toBe('Wycieczka — 2026-09-20 (cały dzień)')
  })
})
