import { describe, expect, it } from 'vitest'
import {
  bladGodzinySync,
  pogrupujLekcjePoDniu,
  posortujLekcje,
  posortujWiadomosci,
  posortujWpisy,
  type Lekcja,
} from './vulcan'

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

describe('bladGodzinySync', () => {
  it('akceptuje 1-3 unikalne godziny HH:MM', () => {
    expect(bladGodzinySync(['06:00', '13:30', '19:00'])).toBeNull()
  })

  it('odrzuca pustą listę', () => {
    expect(bladGodzinySync([])).toContain('przynajmniej jedną')
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
