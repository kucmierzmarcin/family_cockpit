import { describe, expect, it } from 'vitest'
import type { DomownikDb } from '../lib/supabase'
import type { Wydarzenie } from '../useWydarzenia'
import { pogrupujPlanDnia } from './planDnia'

function osoba(id: string, name: string): DomownikDb {
  return { id, name, color: 'fiolet' } as DomownikDb
}

function wyd(id: string, godzina: number, osobyId: string[], tytul = 'Coś'): Wydarzenie {
  return {
    id,
    tytul,
    start: new Date(2026, 8, 17, godzina, 0),
    koniec: new Date(2026, 8, 17, godzina + 1, 0),
    osobyId,
    calodniowe: false,
  } as Wydarzenie
}

const MARCIN = osoba('m', 'Marcin')
const ANIA = osoba('a', 'Ania')
const KUBA = osoba('k', 'Kuba')
const DOM = [MARCIN, ANIA, KUBA]

describe('pogrupujPlanDnia', () => {
  it('dzieli dom na tych, którzy coś mają, i na wolnych', () => {
    const plan = pogrupujPlanDnia(DOM, [wyd('1', 8, ['a'])])
    expect(plan.zajeci.map((z) => z.osoba.name)).toEqual(['Ania'])
    expect(plan.wolni.map((o) => o.name)).toEqual(['Marcin', 'Kuba'])
  })

  it('trzyma kolejność domu, nie kolejność wydarzeń', () => {
    const plan = pogrupujPlanDnia(DOM, [wyd('1', 9, ['k']), wyd('2', 8, ['m'])])
    expect(plan.zajeci.map((z) => z.osoba.name)).toEqual(['Marcin', 'Kuba'])
  })

  it('porządkuje wydarzenia osoby po godzinie rozpoczęcia', () => {
    const plan = pogrupujPlanDnia(DOM, [
      wyd('1', 16, ['a'], 'Trening'),
      wyd('2', 8, ['a'], 'Szkoła'),
    ])
    expect(plan.zajeci[0].wydarzenia.map((w) => w.tytul)).toEqual(['Szkoła', 'Trening'])
  })

  it('wspólne wydarzenie trafia pod każdego uczestnika - inaczej jedno z imion by je zgubiło', () => {
    const plan = pogrupujPlanDnia(DOM, [wyd('1', 18, ['m', 'a'], 'Kino')])
    expect(plan.zajeci.map((z) => z.osoba.name)).toEqual(['Marcin', 'Ania'])
    expect(plan.zajeci[0].wydarzenia[0].tytul).toBe('Kino')
    expect(plan.zajeci[1].wydarzenia[0].tytul).toBe('Kino')
    expect(plan.wolni.map((o) => o.name)).toEqual(['Kuba'])
  })

  it('wydarzenie bez przypisanej osoby nie robi z nikogo zajętego', () => {
    const plan = pogrupujPlanDnia(DOM, [wyd('1', 10, [])])
    expect(plan.zajeci).toEqual([])
    expect(plan.wolni).toHaveLength(3)
  })

  it('pusty dzień to sami wolni, pusty dom to nic', () => {
    expect(pogrupujPlanDnia(DOM, []).wolni).toHaveLength(3)
    expect(pogrupujPlanDnia([], [wyd('1', 8, ['m'])])).toEqual({ zajeci: [], wolni: [] })
  })

  it('każdy domownik jest dokładnie po jednej stronie podziału', () => {
    const plan = pogrupujPlanDnia(DOM, [wyd('1', 8, ['a']), wyd('2', 9, ['k'])])
    expect(plan.zajeci.length + plan.wolni.length).toBe(DOM.length)
  })
})
