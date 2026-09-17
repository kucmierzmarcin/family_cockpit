import { describe, expect, it } from 'vitest'
import {
  bladGodzinySync,
  blokiSzkolne,
  czyNieusprawiedliwiona,
  oczyscTrescWiadomosci,
  pogrupujLekcjePoDniu,
  posortujLekcje,
  posortujObecnosci,
  posortujWiadomosci,
  posortujWpisy,
  type Lekcja,
  type Obecnosc,
  type Uczen,
} from './vulcan'

function obecnosc(dane: Partial<Obecnosc>): Obecnosc {
  return {
    id: 'o1',
    uczenId: 'u1',
    data: '2026-09-14',
    przedmiot: 'Matematyka',
    nazwaTypu: 'Nieobecność nieusprawiedliwiona',
    nieobecnosc: true,
    usprawiedliwiona: false,
    zwolnienie: false,
    ...dane,
  }
}

function lekcja(dane: Partial<Lekcja>): Lekcja {
  return {
    id: 'l1',
    uczenId: 'u1',
    data: '2026-09-14',
    od: '08:00',
    do: '08:45',
    przedmiot: 'Matematyka',
    nauczyciel: null,
    sala: null,
    zmieniona: false,
    opisZmiany: null,
    ...dane,
  }
}

function uczen(dane: Partial<Uczen>): Uczen {
  return {
    id: 'u1',
    imie: 'Zuzia',
    nazwisko: 'Kowalska',
    klasa: '5a',
    memberId: 'm1',
    ...dane,
  }
}

describe('posortujLekcje', () => {
  it('sortuje najpierw po dacie, potem po godzinie', () => {
    const wynik = posortujLekcje([
      lekcja({ id: 'a', data: '2026-09-15', od: '08:00' }),
      lekcja({ id: 'b', data: '2026-09-14', od: '09:00' }),
      lekcja({ id: 'c', data: '2026-09-14', od: '08:00' }),
    ])
    expect(wynik.map((l) => l.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('pogrupujLekcjePoDniu', () => {
  it('grupuje po dacie i sortuje wewnątrz grupy', () => {
    const grupy = pogrupujLekcjePoDniu([
      lekcja({ id: 'a', data: '2026-09-14', od: '09:00' }),
      lekcja({ id: 'b', data: '2026-09-14', od: '08:00' }),
    ])
    expect(grupy.get('2026-09-14')?.map((l) => l.id)).toEqual(['b', 'a'])
  })
})

describe('posortujWpisy', () => {
  it('sortuje chronologicznie', () => {
    const wynik = posortujWpisy([{ data: '2026-09-20' }, { data: '2026-09-15' }])
    expect(wynik.map((w) => w.data)).toEqual(['2026-09-15', '2026-09-20'])
  })
})

describe('posortujWiadomosci', () => {
  it('sortuje od najnowszej', () => {
    const wynik = posortujWiadomosci([{ data: '2026-09-01' }, { data: '2026-09-10' }])
    expect(wynik.map((w) => w.data)).toEqual(['2026-09-10', '2026-09-01'])
  })
})

describe('blokiSzkolne', () => {
  it('liczy start i koniec z pierwszej i ostatniej lekcji tego samego dnia', () => {
    const bloki = blokiSzkolne(
      [
        lekcja({ id: 'a', od: '08:00', do: '08:45' }),
        lekcja({ id: 'b', od: '09:50', do: '10:35' }),
        lekcja({ id: 'c', od: '08:50', do: '09:35' }),
      ],
      [uczen({})],
    )

    expect(bloki).toHaveLength(1)
    expect(bloki[0].start).toEqual(new Date(2026, 8, 14, 8, 0))
    expect(bloki[0].koniec).toEqual(new Date(2026, 8, 14, 10, 35))
  })

  it('robi osobny blok na kazdego ucznia i kazdy dzien', () => {
    const bloki = blokiSzkolne(
      [
        lekcja({ id: 'a', uczenId: 'u1', data: '2026-09-14' }),
        lekcja({ id: 'b', uczenId: 'u2', data: '2026-09-14' }),
        lekcja({ id: 'c', uczenId: 'u1', data: '2026-09-15' }),
      ],
      [uczen({ id: 'u1', imie: 'Zuzia', memberId: 'm1' }), uczen({ id: 'u2', imie: 'Oliwier', memberId: 'm2' })],
    )

    expect(bloki).toHaveLength(3)
  })

  it('tytul zawiera imie ucznia, osobyId to jego memberId', () => {
    const bloki = blokiSzkolne([lekcja({})], [uczen({ imie: 'Zuzia', memberId: 'm1' })])
    expect(bloki[0].tytul).toBe('Szkoła — Zuzia')
    expect(bloki[0].osobyId).toEqual(['m1'])
  })

  it('uczen bez przypisanego domownika - wspolne wydarzenie (pusta lista osob)', () => {
    const bloki = blokiSzkolne([lekcja({})], [uczen({ memberId: null })])
    expect(bloki[0].osobyId).toEqual([])
  })

  it('oznacza kazdy blok jako blokSzkolny, zeby kalendarz nie traktowal go jak prawdziwe wydarzenie', () => {
    const bloki = blokiSzkolne([lekcja({})], [uczen({})])
    expect(bloki[0].blokSzkolny).toBe(true)
  })

  it('pomija lekcje ucznia, ktorego juz nie ma na liscie (np. odlaczony)', () => {
    const bloki = blokiSzkolne([lekcja({ uczenId: 'widmo' })], [uczen({ id: 'u1' })])
    expect(bloki).toHaveLength(0)
  })
})

describe('oczyscTrescWiadomosci', () => {
  it('zamienia akapity na puste linie, usuwa znaczniki', () => {
    const wynik = oczyscTrescWiadomosci('<p>Dobry wieczór,</p><p>Zajęcia od 8.45</p>')
    expect(wynik).toBe('Dobry wieczór,\n\nZajęcia od 8.45')
  })

  it('zamienia <br> na pojedynczy znak nowej linii', () => {
    expect(oczyscTrescWiadomosci('Linia 1<br>Linia 2<br/>Linia 3')).toBe('Linia 1\nLinia 2\nLinia 3')
  })

  it('dekoduje podstawowe encje HTML', () => {
    expect(oczyscTrescWiadomosci('Ala&nbsp;i&nbsp;Ola &amp; Bob &lt;3')).toBe('Ala i Ola & Bob <3')
  })

  it('nie zostawia potrojnych/wiekszych odstepow miedzy liniami', () => {
    expect(oczyscTrescWiadomosci('<p>A</p><p></p><p>B</p>')).toBe('A\n\nB')
  })
})

describe('czyNieusprawiedliwiona', () => {
  it('nieobecnosc bez usprawiedliwienia i bez zwolnienia - nieusprawiedliwiona', () => {
    expect(czyNieusprawiedliwiona(obecnosc({}))).toBe(true)
  })

  it('nieobecnosc juz usprawiedliwiona - nie liczy sie', () => {
    expect(czyNieusprawiedliwiona(obecnosc({ usprawiedliwiona: true }))).toBe(false)
  })

  it('zwolnienie (np. lekarskie) - nie liczy sie mimo braku usprawiedliwienia', () => {
    expect(czyNieusprawiedliwiona(obecnosc({ zwolnienie: true }))).toBe(false)
  })

  it('obecnosc (nie nieobecnosc) - nigdy nie liczy sie', () => {
    expect(czyNieusprawiedliwiona(obecnosc({ nieobecnosc: false }))).toBe(false)
  })
})

describe('posortujObecnosci', () => {
  it('sortuje od najnowszej', () => {
    const wynik = posortujObecnosci([obecnosc({ id: 'a', data: '2026-09-01' }), obecnosc({ id: 'b', data: '2026-09-10' })])
    expect(wynik.map((o) => o.id)).toEqual(['b', 'a'])
  })
})

describe('bladGodzinySync', () => {
  it('akceptuje 1-3 unikalne godziny HH:MM', () => {
    expect(bladGodzinySync(['06:00', '13:30', '19:00'])).toBeNull()
  })

  it('akceptuje pustą listę - to wyłączenie automatycznej synchronizacji', () => {
    expect(bladGodzinySync([])).toBeNull()
  })

  it('odrzuca więcej niż 3 godziny', () => {
    expect(bladGodzinySync(['06:00', '10:00', '14:00', '18:00'])).toContain('Maksymalnie')
  })

  it('odrzuca duplikaty', () => {
    expect(bladGodzinySync(['06:00', '06:00'])).toContain('dwa razy')
  })

  it('odrzuca zły format', () => {
    expect(bladGodzinySync(['6:00'])).not.toBeNull()
    expect(bladGodzinySync(['25:00'])).not.toBeNull()
  })
})
