// src/terminy.test.ts
import { describe, expect, it } from 'vitest'
import {
  bezpiecznaNazwaPliku,
  bladZalacznika,
  czyPrzeterminowany,
  formatujTermin,
  posortujTerminy,
} from './terminy'

function t(id: string, termin: string) {
  return { id, termin }
}

describe('posortujTerminy', () => {
  it('sortuje rosnaco po dacie', () => {
    const wynik = posortujTerminy([
      t('pozniej', '2026-12-01'),
      t('najwczesniej', '2026-09-15'),
      t('srodek', '2026-10-01'),
    ])
    expect(wynik.map((x) => x.id)).toEqual(['najwczesniej', 'srodek', 'pozniej'])
  })

  it('nie zmienia tablicy wejsciowej', () => {
    const wejscie = [t('b', '2026-12-01'), t('a', '2026-09-01')]
    posortujTerminy(wejscie)
    expect(wejscie.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('czyPrzeterminowany', () => {
  it('data w przeszlosci jest przeterminowana', () => {
    expect(czyPrzeterminowany('2026-09-01', '2026-09-12')).toBe(true)
  })

  it('dzisiejsza data nie jest przeterminowana', () => {
    expect(czyPrzeterminowany('2026-09-12', '2026-09-12')).toBe(false)
  })

  it('data w przyszlosci nie jest przeterminowana', () => {
    expect(czyPrzeterminowany('2026-09-13', '2026-09-12')).toBe(false)
  })
})

describe('formatujTermin', () => {
  it('formatuje date po polsku z rokiem', () => {
    expect(formatujTermin('2026-12-01')).toBe('1 grudnia 2026')
  })

  it('nie gubi dnia przy przejsciu przez strefy - 1 stycznia zostaje 1 stycznia', () => {
    expect(formatujTermin('2027-01-01')).toBe('1 stycznia 2027')
  })
})

describe('bladZalacznika', () => {
  it('akceptuje PDF do 10 MB', () => {
    expect(bladZalacznika({ type: 'application/pdf', size: 5 * 1024 * 1024 })).toBeNull()
  })

  it('akceptuje zdjecie JPEG', () => {
    expect(bladZalacznika({ type: 'image/jpeg', size: 1024 })).toBeNull()
  })

  it('akceptuje plik dokladnie na limicie', () => {
    expect(bladZalacznika({ type: 'application/pdf', size: 10 * 1024 * 1024 })).toBeNull()
  })

  it('odrzuca plik wiekszy niz 10 MB', () => {
    expect(bladZalacznika({ type: 'application/pdf', size: 10 * 1024 * 1024 + 1 })).toContain('duży')
  })

  it('odrzuca niedozwolony typ pliku', () => {
    expect(bladZalacznika({ type: 'application/zip', size: 1024 })).toContain('Dozwolone')
  })
})

describe('bezpiecznaNazwaPliku', () => {
  it('usuwa spacje i polskie znaki diakrytyczne', () => {
    expect(bezpiecznaNazwaPliku('Oliwier Kućmierz 1a.jpg')).toBe('Oliwier_Kucmierz_1a.jpg')
  })

  it('nie zmienia nazwy juz bezpiecznej', () => {
    expect(bezpiecznaNazwaPliku('IMG_9168.jpg')).toBe('IMG_9168.jpg')
  })

  it('zamienia na podkreslnik znak, ktory nie ma rozkladu NFD (np. Ł)', () => {
    expect(bezpiecznaNazwaPliku('Łódź.pdf')).toBe('_odz.pdf')
  })
})
