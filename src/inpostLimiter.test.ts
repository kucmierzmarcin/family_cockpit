import { describe, expect, it } from 'vitest'
import { utworzLimiterInpost } from './inpostLimiter'

describe('utworzLimiterInpost', () => {
  it('pozwala na proby do limitu na numer, potem odrzuca', () => {
    const limiter = utworzLimiterInpost({ limitNaNumer: 3, limitGlobalny: 100 })

    expect(limiter.pozwalaj('600100200')).toBe(true)
    expect(limiter.pozwalaj('600100200')).toBe(true)
    expect(limiter.pozwalaj('600100200')).toBe(true)
    expect(limiter.pozwalaj('600100200')).toBe(false)
  })

  it('limit na numer nie wplywa na inny numer', () => {
    const limiter = utworzLimiterInpost({ limitNaNumer: 1, limitGlobalny: 100 })

    expect(limiter.pozwalaj('600100200')).toBe(true)
    expect(limiter.pozwalaj('600100200')).toBe(false)
    expect(limiter.pozwalaj('700300400')).toBe(true)
  })

  it('po uplywie okna czasowego numer znow moze probowac', () => {
    let teraz = 0
    const limiter = utworzLimiterInpost({
      limitNaNumer: 1,
      oknoNaNumerMs: 1000,
      limitGlobalny: 100,
      teraz: () => teraz,
    })

    expect(limiter.pozwalaj('600100200')).toBe(true)
    expect(limiter.pozwalaj('600100200')).toBe(false)

    teraz = 1001
    expect(limiter.pozwalaj('600100200')).toBe(true)
  })

  it('globalny limit odrzuca kolejne proby nawet dla roznych numerow', () => {
    const limiter = utworzLimiterInpost({ limitNaNumer: 100, limitGlobalny: 2 })

    expect(limiter.pozwalaj('600100200')).toBe(true)
    expect(limiter.pozwalaj('700300400')).toBe(true)
    expect(limiter.pozwalaj('800500600')).toBe(false)
  })

  it('po uplywie okna globalnego znow pozwala', () => {
    let teraz = 0
    const limiter = utworzLimiterInpost({
      limitNaNumer: 100,
      limitGlobalny: 1,
      oknoGlobalneMs: 1000,
      teraz: () => teraz,
    })

    expect(limiter.pozwalaj('600100200')).toBe(true)
    expect(limiter.pozwalaj('700300400')).toBe(false)

    teraz = 1001
    expect(limiter.pozwalaj('700300400')).toBe(true)
  })
})
