import { describe, expect, it } from 'vitest'
import { policzPozostale, posortujPozycje, saOdhaczone } from './pozycje'

function poz(id: string, kupione: boolean, dodano: string) {
  return { id, kupione, dodano }
}

describe('posortujPozycje', () => {
  it('niekupione idą przed odhaczonymi', () => {
    const wynik = posortujPozycje([
      poz('a', true, '2026-09-01T10:00:00'),
      poz('b', false, '2026-09-01T11:00:00'),
    ])
    expect(wynik.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('w obrębie grupy zachowuje kolejność dopisywania', () => {
    const wynik = posortujPozycje([
      poz('trzeci', false, '2026-09-01T12:00:00'),
      poz('pierwszy', false, '2026-09-01T10:00:00'),
      poz('drugi', false, '2026-09-01T11:00:00'),
    ])
    expect(wynik.map((p) => p.id)).toEqual(['pierwszy', 'drugi', 'trzeci'])
  })

  it('odhaczone też są uporządkowane między sobą', () => {
    const wynik = posortujPozycje([
      poz('nowsze', true, '2026-09-01T12:00:00'),
      poz('starsze', true, '2026-09-01T10:00:00'),
    ])
    expect(wynik.map((p) => p.id)).toEqual(['starsze', 'nowsze'])
  })

  it('nie zmienia tablicy wejściowej', () => {
    const wejscie = [poz('a', true, '2026-09-01T10:00:00'), poz('b', false, '2026-09-01T11:00:00')]
    posortujPozycje(wejscie)
    expect(wejscie.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('pusta lista zostaje pusta', () => {
    expect(posortujPozycje([])).toEqual([])
  })
})

describe('policzPozostale', () => {
  it('liczy tylko nieodhaczone', () => {
    expect(
      policzPozostale([
        poz('a', false, '1'),
        poz('b', true, '2'),
        poz('c', false, '3'),
      ]),
    ).toBe(2)
  })

  it('wszystko kupione daje zero', () => {
    expect(policzPozostale([poz('a', true, '1')])).toBe(0)
  })

  it('pusta lista daje zero', () => {
    expect(policzPozostale([])).toBe(0)
  })
})

describe('saOdhaczone', () => {
  it('rozpoznaje, że jest co czyścić', () => {
    expect(saOdhaczone([poz('a', false, '1'), poz('b', true, '2')])).toBe(true)
  })

  it('sama lista do kupienia nie daje nic do czyszczenia', () => {
    expect(saOdhaczone([poz('a', false, '1')])).toBe(false)
  })

  it('pusta lista nie daje nic do czyszczenia', () => {
    expect(saOdhaczone([])).toBe(false)
  })
})
