import { describe, expect, it } from 'vitest'
import type { DomownikDb } from './lib/supabase'
import { BEZ_OSOBY, barwyWydarzenia, osobyWydarzenia, widocznePrzyFiltrze } from './osoby'
import { kolor } from './kolory'

/** Domownik na potrzeby testu - liczą się tylko id, imię i kolor. */
function osoba(id: string, name: string, color: string): DomownikDb {
  return {
    id,
    household_id: 'dom',
    name,
    color,
    role: 'domownik',
    user_id: null,
    email: null,
    created_at: '2026-01-01T00:00:00',
    digest_enabled: false,
    digest_at: '07:00:00',
    telegram_chat_id: null,
  }
}

// Kolejność w mapie odpowiada kolejności domowników w domu.
const ania = osoba('a', 'Ania', 'fiolet')
const tomek = osoba('t', 'Tomek', 'rozowy')
const zosia = osoba('z', 'Zosia', 'zielony')
const dom = new Map([
  [ania.id, ania],
  [tomek.id, tomek],
  [zosia.id, zosia],
])

describe('osobyWydarzenia', () => {
  it('bez przypisania zwraca pustą listę', () => {
    expect(osobyWydarzenia([], dom)).toEqual([])
  })

  it('zwraca przypisane osoby', () => {
    expect(osobyWydarzenia(['a', 'z'], dom).map((o) => o.name)).toEqual(['Ania', 'Zosia'])
  })

  it('porządkuje osoby wg kolejności w domu, nie wg kolejności przypisania', () => {
    expect(osobyWydarzenia(['z', 'a', 't'], dom).map((o) => o.name))
      .toEqual(['Ania', 'Tomek', 'Zosia'])
  })

  it('pomija osoby, których nie ma już w domu', () => {
    expect(osobyWydarzenia(['a', 'ktos-usuniety'], dom).map((o) => o.name)).toEqual(['Ania'])
  })
})

describe('barwyWydarzenia', () => {
  it('bierze kolor pierwszej osoby wg kolejności w domu', () => {
    // Zosia podana pierwsza, ale w domu jest po Ani - kolor ma być Ani.
    expect(barwyWydarzenia(['z', 'a'], dom)).toEqual(kolor('fiolet'))
  })

  it('wydarzenie bez osób dostaje barwy neutralne', () => {
    const barwy = barwyWydarzenia([], dom)
    expect(barwy).not.toEqual(kolor('fiolet'))
    expect(barwy.tlo).toBe('#eeedf2')
  })

  it('osoba spoza domu nie narzuca koloru', () => {
    expect(barwyWydarzenia(['ktos-usuniety'], dom).tlo).toBe('#eeedf2')
  })
})

describe('widocznePrzyFiltrze', () => {
  it('bez ukrytych widać wszystko', () => {
    expect(widocznePrzyFiltrze(['a', 't'], new Set())).toBe(true)
  })

  it('wydarzenie zostaje, dopóki widoczny jest choć jeden uczestnik', () => {
    expect(widocznePrzyFiltrze(['a', 't'], new Set(['t']))).toBe(true)
  })

  it('znika dopiero po ukryciu wszystkich uczestników', () => {
    expect(widocznePrzyFiltrze(['a', 't'], new Set(['a', 't']))).toBe(false)
  })

  it('wydarzenie bez osób słucha przełącznika "Bez osoby"', () => {
    expect(widocznePrzyFiltrze([], new Set())).toBe(true)
    expect(widocznePrzyFiltrze([], new Set([BEZ_OSOBY]))).toBe(false)
  })

  it('ukrycie "Bez osoby" nie rusza wydarzeń z przypisaniem', () => {
    expect(widocznePrzyFiltrze(['a'], new Set([BEZ_OSOBY]))).toBe(true)
  })
})
