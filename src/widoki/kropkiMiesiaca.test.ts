import { describe, expect, it } from 'vitest'
import { ulozKropki } from './kropkiMiesiaca'

describe('ulozKropki', () => {
  it('poniżej limitu pokazuje wszystko, bez nadmiaru', () => {
    expect(ulozKropki(0, 6)).toEqual({ pokaz: 0, nadmiar: 0 })
    expect(ulozKropki(1, 6)).toEqual({ pokaz: 1, nadmiar: 0 })
    expect(ulozKropki(6, 6)).toEqual({ pokaz: 6, nadmiar: 0 })
  })

  it('jedno ponad limit mieści się mimo wszystko - „+1" zajmuje tyle co kropka, a mówi mniej', () => {
    expect(ulozKropki(7, 6)).toEqual({ pokaz: 7, nadmiar: 0 })
  })

  it('dwa i więcej ponad limit zwija się w licznik', () => {
    expect(ulozKropki(8, 6)).toEqual({ pokaz: 6, nadmiar: 2 })
    expect(ulozKropki(12, 6)).toEqual({ pokaz: 6, nadmiar: 6 })
  })

  it('suma zawsze zgadza się z liczbą wydarzeń - nic nie ginie po cichu', () => {
    for (let ile = 0; ile <= 20; ile++) {
      const { pokaz, nadmiar } = ulozKropki(ile, 6)
      expect(pokaz + nadmiar).toBe(ile)
    }
  })
})
