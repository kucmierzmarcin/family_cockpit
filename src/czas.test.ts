import { describe, expect, it } from 'vitest'
import { klucz } from './dates'
import {
  dniWydarzenia,
  minutyOdPolnocy,
  nachodzi,
  naTimestamp,
  opisCzasu,
  seria,
  ukladajKolumny,
  wJednymDniu,
  zTimestampu,
} from './czas'

/** Skrót do czytelnego zapisu dat w testach. */
function d(tekst: string): Date {
  return new Date(tekst)
}

describe('nachodzi', () => {
  const od = d('2026-09-07T00:00:00')
  const doKiedy = d('2026-09-14T00:00:00') // poniedziałek do poniedziałku

  it('widzi wydarzenie w środku zakresu', () => {
    expect(nachodzi({ start: d('2026-09-09T18:00'), koniec: d('2026-09-09T20:00') }, od, doKiedy))
      .toBe(true)
  })

  it('nie widzi wydarzenia przed zakresem', () => {
    expect(nachodzi({ start: d('2026-09-06T18:00'), koniec: d('2026-09-06T20:00') }, od, doKiedy))
      .toBe(false)
  })

  it('nie widzi wydarzenia po zakresie', () => {
    expect(nachodzi({ start: d('2026-09-14T09:00'), koniec: d('2026-09-14T10:00') }, od, doKiedy))
      .toBe(false)
  })

  it('widzi wydarzenie, które obejmuje cały zakres', () => {
    expect(nachodzi({ start: d('2026-08-01T00:00'), koniec: d('2026-10-01T00:00') }, od, doKiedy))
      .toBe(true)
  })

  it('widzi wydarzenie wchodzące w zakres tylko końcówką', () => {
    expect(nachodzi({ start: d('2026-09-05T00:00'), koniec: d('2026-09-07T12:00') }, od, doKiedy))
      .toBe(true)
  })

  it('nie widzi wydarzenia kończącego się dokładnie na początku zakresu', () => {
    expect(nachodzi({ start: d('2026-09-06T20:00'), koniec: d('2026-09-07T00:00') }, od, doKiedy))
      .toBe(false)
  })

  it('nie widzi wydarzenia zaczynającego się dokładnie na końcu zakresu', () => {
    expect(nachodzi({ start: d('2026-09-14T00:00'), koniec: d('2026-09-14T10:00') }, od, doKiedy))
      .toBe(false)
  })
})

describe('dniWydarzenia', () => {
  it('wydarzenie godzinne zajmuje jeden dzień', () => {
    expect(dniWydarzenia({ start: d('2026-09-09T18:00'), koniec: d('2026-09-09T20:00') }))
      .toEqual(['2026-09-09'])
  })

  it('wydarzenie kończące się dokładnie o północy nie zajmuje dnia następnego', () => {
    expect(dniWydarzenia({ start: d('2026-09-09T22:00'), koniec: d('2026-09-10T00:00') }))
      .toEqual(['2026-09-09'])
  })

  it('wydarzenie przez północ zajmuje dwa dni', () => {
    expect(dniWydarzenia({ start: d('2026-09-09T22:00'), koniec: d('2026-09-10T02:00') }))
      .toEqual(['2026-09-09', '2026-09-10'])
  })

  it('wyjazd całodniowy zajmuje wszystkie dni od pierwszego do ostatniego', () => {
    // Wakacje 10-12 lipca: północ 10-go do północy 13-go.
    expect(dniWydarzenia({ start: d('2026-07-10T00:00'), koniec: d('2026-07-13T00:00') }))
      .toEqual(['2026-07-10', '2026-07-11', '2026-07-12'])
  })

  it('przycina listę do podanego zakresu', () => {
    const dlugie = { start: d('2026-07-01T00:00'), koniec: d('2026-08-01T00:00') }
    expect(dniWydarzenia(dlugie, d('2026-07-05T00:00'), d('2026-07-08T00:00')))
      .toEqual(['2026-07-05', '2026-07-06', '2026-07-07'])
  })
})

describe('wJednymDniu', () => {
  it('rozpoznaje wydarzenie mieszczące się w jednym dniu', () => {
    expect(wJednymDniu({ start: d('2026-09-09T18:00'), koniec: d('2026-09-09T20:00') })).toBe(true)
  })

  it('wydarzenie do północy wciąż jest jednodniowe', () => {
    expect(wJednymDniu({ start: d('2026-09-09T22:00'), koniec: d('2026-09-10T00:00') })).toBe(true)
  })

  it('wydarzenie przez północ nie jest jednodniowe', () => {
    expect(wJednymDniu({ start: d('2026-09-09T22:00'), koniec: d('2026-09-10T02:00') })).toBe(false)
  })
})

describe('minutyOdPolnocy', () => {
  it('liczy minuty od początku doby', () => {
    expect(minutyOdPolnocy(d('2026-09-09T00:00'))).toBe(0)
    expect(minutyOdPolnocy(d('2026-09-09T07:30'))).toBe(450)
    expect(minutyOdPolnocy(d('2026-09-09T23:59'))).toBe(1439)
  })
})

describe('opisCzasu', () => {
  it('wydarzenie godzinne pokazuje zakres godzin', () => {
    expect(opisCzasu({ start: d('2026-09-09T18:00'), koniec: d('2026-09-09T20:00') }, false))
      .toBe('18:00–20:00')
  })

  it('wydarzenie całodniowe jednodniowe', () => {
    expect(opisCzasu({ start: d('2026-09-09T00:00'), koniec: d('2026-09-10T00:00') }, true))
      .toBe('cały dzień')
  })

  it('wydarzenie całodniowe wielodniowe pokazuje zakres dat', () => {
    expect(opisCzasu({ start: d('2026-07-10T00:00'), koniec: d('2026-07-13T00:00') }, true))
      .toBe('10.07–12.07')
  })

  it('wydarzenie godzinne przez kilka dni pokazuje daty z godzinami', () => {
    expect(opisCzasu({ start: d('2026-09-09T22:00'), koniec: d('2026-09-10T06:00') }, false))
      .toBe('9.09 22:00 – 10.09 06:00')
  })
})

describe('seria', () => {
  const start = d('2026-09-08T18:00') // wtorek
  const koniec = d('2026-09-08T20:00')

  it('bez powtarzania daje jedno wystąpienie', () => {
    const wynik = seria(start, koniec, 'brak', d('2027-09-08T00:00'))
    expect(wynik).toHaveLength(1)
    expect(wynik[0].start).toEqual(start)
  })

  it('co tydzień trzyma się tego samego dnia tygodnia', () => {
    const wynik = seria(start, koniec, 'tydzien', d('2026-10-01T00:00'))
    expect(wynik.map((w) => klucz(w.start)))
      .toEqual(['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'])
  })

  it('zachowuje długość wydarzenia w każdym wystąpieniu', () => {
    const wynik = seria(start, koniec, 'tydzien', d('2026-09-30T00:00'))
    for (const w of wynik) {
      expect(w.koniec.getTime() - w.start.getTime()).toBe(2 * 60 * 60 * 1000)
    }
  })

  it('co dwa tygodnie pomija co drugi', () => {
    const wynik = seria(start, koniec, 'dwa-tygodnie', d('2026-10-08T00:00'))
    expect(wynik.map((w) => klucz(w.start)))
      .toEqual(['2026-09-08', '2026-09-22', '2026-10-06'])
  })

  it('co miesiąc trzyma ten sam dzień miesiąca', () => {
    const wynik = seria(d('2026-01-15T10:00'), d('2026-01-15T11:00'), 'miesiac', d('2026-05-01T00:00'))
    expect(wynik.map((w) => klucz(w.start)))
      .toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'])
  })

  it('co miesiąc pomija miesiące bez 31. dnia zamiast przesuwać', () => {
    const wynik = seria(d('2026-01-31T10:00'), d('2026-01-31T11:00'), 'miesiac', d('2026-06-01T00:00'))
    expect(wynik.map((w) => klucz(w.start)))
      .toEqual(['2026-01-31', '2026-03-31', '2026-05-31'])
  })

  it('nie generuje wystąpień po dacie końcowej', () => {
    const wynik = seria(start, koniec, 'tydzien', d('2026-09-16T00:00'))
    expect(wynik.map((w) => klucz(w.start)))
      .toEqual(['2026-09-08', '2026-09-15'])
  })
})

describe('ukladajKolumny', () => {
  it('rozdzielne wydarzenia dostają pełną szerokość', () => {
    const wynik = ukladajKolumny([
      { start: d('2026-09-09T08:00'), koniec: d('2026-09-09T09:00') },
      { start: d('2026-09-09T10:00'), koniec: d('2026-09-09T11:00') },
    ])
    expect(wynik.map((w) => [w.kolumna, w.kolumn])).toEqual([[0, 1], [0, 1]])
  })

  it('dwa nakładające się dzielą szerokość na pół', () => {
    const wynik = ukladajKolumny([
      { start: d('2026-09-09T08:00'), koniec: d('2026-09-09T10:00') },
      { start: d('2026-09-09T09:00'), koniec: d('2026-09-09T11:00') },
    ])
    expect(wynik.map((w) => [w.kolumna, w.kolumn])).toEqual([[0, 2], [1, 2]])
  })

  it('stykające się wydarzenia nie liczą się jako nakładające', () => {
    const wynik = ukladajKolumny([
      { start: d('2026-09-09T08:00'), koniec: d('2026-09-09T09:00') },
      { start: d('2026-09-09T09:00'), koniec: d('2026-09-09T10:00') },
    ])
    expect(wynik.map((w) => [w.kolumna, w.kolumn])).toEqual([[0, 1], [0, 1]])
  })

  it('trzy nakładające się dzielą szerokość na trzy', () => {
    const wynik = ukladajKolumny([
      { start: d('2026-09-09T08:00'), koniec: d('2026-09-09T12:00') },
      { start: d('2026-09-09T09:00'), koniec: d('2026-09-09T12:00') },
      { start: d('2026-09-09T10:00'), koniec: d('2026-09-09T12:00') },
    ])
    expect(wynik.map((w) => [w.kolumna, w.kolumn])).toEqual([[0, 3], [1, 3], [2, 3]])
  })
})

describe('naTimestamp i zTimestampu', () => {
  it('zapisuje czas lokalny bez przeliczania na UTC', () => {
    expect(naTimestamp(d('2026-09-09T18:30:00'))).toBe('2026-09-09T18:30:00')
  })

  it('zapisuje północ jako północ', () => {
    expect(naTimestamp(d('2026-07-10T00:00:00'))).toBe('2026-07-10T00:00:00')
  })

  it('czyta wartość z bazy jako czas lokalny', () => {
    const odczytane = zTimestampu('2026-09-09T18:30:00')
    expect(odczytane.getHours()).toBe(18)
    expect(odczytane.getMinutes()).toBe(30)
  })

  it('radzi sobie z formatem ze spacją zamiast T', () => {
    expect(zTimestampu('2026-09-09 18:30:00').getHours()).toBe(18)
  })

  it('ignoruje doklejoną strefę, zamiast przesuwać godzinę', () => {
    expect(zTimestampu('2026-09-09T18:30:00Z').getHours()).toBe(18)
    expect(zTimestampu('2026-09-09T18:30:00+00:00').getHours()).toBe(18)
  })

  it('zapis i odczyt dają tę samą chwilę', () => {
    const oryginal = d('2026-12-31T23:45:00')
    expect(zTimestampu(naTimestamp(oryginal)).getTime()).toBe(oryginal.getTime())
  })
})
