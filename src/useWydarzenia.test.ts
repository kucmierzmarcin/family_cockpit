import { describe, expect, it } from 'vitest'
import { wierszeZPozycji, type PozycjaImportu } from './useWydarzenia'

describe('wierszeZPozycji', () => {
  it('zwykłe wystąpienie dostaje godziny z wystąpienia', () => {
    const pozycja: PozycjaImportu = {
      tytul: 'Matematyka',
      czlonekId: null,
      wystapienia: [{ data: '2026-09-08', start: '08:00', koniec: '08:45', calodniowe: false }],
    }
    expect(wierszeZPozycji(pozycja, null)).toEqual([
      {
        title: 'Matematyka',
        starts_at: '2026-09-08T08:00:00',
        ends_at: '2026-09-08T08:45:00',
        all_day: false,
        series_id: null,
      },
    ])
  })

  it('wystąpienie całodniowe zajmuje dokładnie jedną dobę, koniec wyłączny', () => {
    const pozycja: PozycjaImportu = {
      tytul: 'Wywóz gabarytów',
      czlonekId: null,
      wystapienia: [{ data: '2026-09-15', start: '00:00', koniec: '00:00', calodniowe: true }],
    }
    const [wiersz] = wierszeZPozycji(pozycja, null)
    expect(wiersz.starts_at).toBe('2026-09-15T00:00:00')
    expect(wiersz.ends_at).toBe('2026-09-16T00:00:00')
    expect(wiersz.all_day).toBe(true)
  })

  it('każde wystąpienie dostaje ten sam series_id, jaki podano', () => {
    const pozycja: PozycjaImportu = {
      tytul: 'Matematyka',
      czlonekId: null,
      wystapienia: [
        { data: '2026-09-08', start: '08:00', koniec: '08:45', calodniowe: false },
        { data: '2026-09-15', start: '08:00', koniec: '08:45', calodniowe: false },
      ],
    }
    const wiersze = wierszeZPozycji(pozycja, 'seria-1')
    expect(wiersze.map((w) => w.series_id)).toEqual(['seria-1', 'seria-1'])
  })
})
