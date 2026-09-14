import { describe, expect, it } from 'vitest'
import { opisPogody, pogodaZOdpowiedzi, zbudujUrlPogody } from './usePogoda'

describe('zbudujUrlPogody', () => {
  it('woła Open-Meteo ze współrzędnymi Milanówka, bez klucza API', () => {
    const url = zbudujUrlPogody()
    expect(url).toContain('https://api.open-meteo.com/v1/forecast')
    expect(url).toContain('latitude=52.1325')
    expect(url).toContain('longitude=20.6539')
    expect(url).not.toContain('key=')
    expect(url).not.toContain('appid=')
  })
})

describe('pogodaZOdpowiedzi', () => {
  it('mapuje aktualną pogodę i prognozę godzinową', () => {
    const dane = {
      current: { time: '2026-09-14T12:00', temperature_2m: 21.4, weather_code: 3 },
      hourly: {
        time: ['2026-09-14T00:00', '2026-09-14T01:00'],
        temperature_2m: [14.1, 13.8],
        weather_code: [1, 1],
      },
    }
    expect(pogodaZOdpowiedzi(dane)).toEqual({
      teraz: { temperatura: 21.4, kod: 3 },
      dzisiaj: [
        { godzina: '00:00', temperatura: 14.1, kod: 1 },
        { godzina: '01:00', temperatura: 13.8, kod: 1 },
      ],
    })
  })
})

describe('opisPogody', () => {
  it('opisuje znane kody WMO', () => {
    expect(opisPogody(0)).toBe('Bezchmurnie')
    expect(opisPogody(61)).toBe('Deszcz słaby')
    expect(opisPogody(95)).toBe('Burza')
  })

  it('nieznany kod dostaje opis zastępczy', () => {
    expect(opisPogody(999)).toBe('Pogoda nieznana')
  })
})
