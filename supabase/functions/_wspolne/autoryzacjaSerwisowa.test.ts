import { describe, expect, it } from 'vitest'
import { jestWywolaniemSerwisowym } from './autoryzacjaSerwisowa'

/** Buduje JWT-owyglądający string z zadanym payloadem (podpis nieważny -
 *  funkcja go celowo nie sprawdza, patrz komentarz w module). */
function token(payload: Record<string, unknown>, czesci = 3): string {
  const base64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const segmenty = [base64url({ alg: 'HS256', typ: 'JWT' }), base64url(payload), 'podpis']
  return segmenty.slice(0, czesci).join('.')
}

describe('jestWywolaniemSerwisowym', () => {
  it('przyjmuje token z rola service_role', () => {
    expect(jestWywolaniemSerwisowym(`Bearer ${token({ role: 'service_role' })}`)).toBe(true)
  })

  it('odrzuca rola authenticated (zwykly zalogowany uzytkownik)', () => {
    expect(jestWywolaniemSerwisowym(`Bearer ${token({ role: 'authenticated' })}`)).toBe(false)
  })

  it('odrzuca token bez trzech czesci', () => {
    expect(jestWywolaniemSerwisowym(`Bearer ${token({ role: 'service_role' }, 2)}`)).toBe(false)
    expect(jestWywolaniemSerwisowym('Bearer abc')).toBe(false)
  })

  it('odrzuca naglowek bez przedrostka Bearer', () => {
    expect(jestWywolaniemSerwisowym(token({ role: 'service_role' }))).toBe(false)
  })

  it('odrzuca pusty naglowek autoryzacji', () => {
    expect(jestWywolaniemSerwisowym('')).toBe(false)
  })

  it('odrzuca payload, ktory nie jest poprawnym JSON-em base64', () => {
    expect(jestWywolaniemSerwisowym('Bearer aaa.###.ccc')).toBe(false)
  })
})
