import { describe, expect, it } from 'vitest'
import { paskiCalodniowe } from './paskiCalodniowe'

function d(tekst: string): Date {
  return new Date(tekst)
}

describe('paskiCalodniowe', () => {
  it('dolacza calodniowe wydarzenie, ktorego data wypada w widocznym zakresie', () => {
    const wydarzenia = [
      { start: d('2026-09-14'), koniec: d('2026-09-15'), calodniowe: true },
    ]
    const wynik = paskiCalodniowe(wydarzenia, d('2026-09-14'), d('2026-09-21'))
    expect(wynik).toHaveLength(1)
  })

  it('wyklucza calodniowe wydarzenie spoza widocznego zakresu (regresja)', () => {
    const wydarzenia = [
      { start: d('2025-09-14'), koniec: d('2025-09-15'), calodniowe: true },
    ]
    const wynik = paskiCalodniowe(wydarzenia, d('2026-09-14'), d('2026-09-21'))
    expect(wynik).toHaveLength(0)
  })

  it('wyklucza wydarzenie jednodniowe, ktore nie jest calodniowe, niezaleznie od daty', () => {
    const wydarzenia = [
      { start: d('2026-09-14T10:00'), koniec: d('2026-09-14T11:00'), calodniowe: false },
    ]
    const wynik = paskiCalodniowe(wydarzenia, d('2026-09-14'), d('2026-09-21'))
    expect(wynik).toHaveLength(0)
  })

  it('dolacza wielodniowe wydarzenie (nie calodniowe), ktore zachodzi na widoczny zakres', () => {
    const wydarzenia = [
      { start: d('2026-09-13T20:00'), koniec: d('2026-09-15T08:00'), calodniowe: false },
    ]
    const wynik = paskiCalodniowe(wydarzenia, d('2026-09-14'), d('2026-09-21'))
    expect(wynik).toHaveLength(1)
  })
})
