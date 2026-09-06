import { describe, expect, it } from 'vitest'
import { kiedy, posortujNotatki } from './notatki'

function nota(id: string, przypieta: boolean, dodano: string) {
  return { id, przypieta, dodano: new Date(dodano) }
}

describe('posortujNotatki', () => {
  it('przypięte idą na górę', () => {
    const wynik = posortujNotatki([
      nota('zwykla', false, '2026-09-06T12:00:00'),
      nota('przypieta', true, '2026-09-01T12:00:00'),
    ])
    expect(wynik.map((n) => n.id)).toEqual(['przypieta', 'zwykla'])
  })

  it('w obrębie grupy najnowsze pierwsze', () => {
    const wynik = posortujNotatki([
      nota('starsza', false, '2026-09-01T12:00:00'),
      nota('najnowsza', false, '2026-09-06T12:00:00'),
      nota('srednia', false, '2026-09-03T12:00:00'),
    ])
    expect(wynik.map((n) => n.id)).toEqual(['najnowsza', 'srednia', 'starsza'])
  })

  it('przypięta zostaje na górze, nawet gdy jest najstarsza', () => {
    const wynik = posortujNotatki([
      nota('nowa', false, '2026-09-06T12:00:00'),
      nota('stara-przypieta', true, '2026-01-01T12:00:00'),
      nota('nowsza', false, '2026-09-07T12:00:00'),
    ])
    expect(wynik[0].id).toBe('stara-przypieta')
  })

  it('kilka przypiętych też jest uporządkowanych między sobą', () => {
    const wynik = posortujNotatki([
      nota('p-starsza', true, '2026-09-01T12:00:00'),
      nota('p-nowsza', true, '2026-09-05T12:00:00'),
    ])
    expect(wynik.map((n) => n.id)).toEqual(['p-nowsza', 'p-starsza'])
  })

  it('nie zmienia tablicy wejściowej', () => {
    const wejscie = [nota('a', false, '2026-09-01T12:00:00'), nota('b', true, '2026-09-02T12:00:00')]
    posortujNotatki(wejscie)
    expect(wejscie.map((n) => n.id)).toEqual(['a', 'b'])
  })
})

describe('kiedy', () => {
  const teraz = new Date('2026-09-06T15:00:00')

  it('sprzed chwili', () => {
    expect(kiedy(new Date('2026-09-06T14:59:40'), teraz)).toBe('przed chwilą')
  })

  it('dzisiaj rano', () => {
    expect(kiedy(new Date('2026-09-06T08:00:00'), teraz)).toBe('dziś')
  })

  it('wczoraj', () => {
    expect(kiedy(new Date('2026-09-05T22:00:00'), teraz)).toBe('wczoraj')
  })

  it('liczy dni, nie godziny - wczoraj o 23:00 to wciąż wczoraj', () => {
    expect(kiedy(new Date('2026-09-05T23:59:00'), new Date('2026-09-06T00:30:00'))).toBe('wczoraj')
  })

  it('kilka dni temu', () => {
    expect(kiedy(new Date('2026-09-03T12:00:00'), teraz)).toBe('3 dni temu')
  })

  it('starsze niż tydzień pokazuje datę', () => {
    expect(kiedy(new Date('2026-08-20T12:00:00'), teraz)).toBe('20.08')
  })

  it('granica tygodnia', () => {
    expect(kiedy(new Date('2026-08-30T12:00:00'), teraz)).toBe('30.08')
  })
})
