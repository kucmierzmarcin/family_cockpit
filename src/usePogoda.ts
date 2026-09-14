import { useEffect, useState } from 'react'

export const SZEROKOSC_MILANOWKA = 52.1325
export const DLUGOSC_MILANOWKA = 20.6539

const ODSWIEZANIE_MS = 30 * 60 * 1000

type OdpowiedzOpenMeteo = {
  current: { time: string; temperature_2m: number; weather_code: number }
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] }
}

export type GodzinaPogody = { godzina: string; temperatura: number; kod: number }

export type Pogoda = {
  teraz: { temperatura: number; kod: number }
  dzisiaj: GodzinaPogody[]
}

/** Adres Open-Meteo dla Milanówka - darmowe API, bez klucza. */
export function zbudujUrlPogody(): string {
  const parametry = new URLSearchParams({
    latitude: String(SZEROKOSC_MILANOWKA),
    longitude: String(DLUGOSC_MILANOWKA),
    current: 'temperature_2m,weather_code',
    hourly: 'temperature_2m,weather_code',
    timezone: 'Europe/Warsaw',
    forecast_days: '1',
  })
  return `https://api.open-meteo.com/v1/forecast?${parametry.toString()}`
}

/** Zamienia odpowiedź Open-Meteo na kształt, z którym pracuje dashboard. */
export function pogodaZOdpowiedzi(dane: OdpowiedzOpenMeteo): Pogoda {
  return {
    teraz: { temperatura: dane.current.temperature_2m, kod: dane.current.weather_code },
    dzisiaj: dane.hourly.time.map((czas, i) => ({
      godzina: czas.slice(11, 16),
      temperatura: dane.hourly.temperature_2m[i],
      kod: dane.hourly.weather_code[i],
    })),
  }
}

/** Opisy kodów pogodowych WMO (tabela 4677), używanych przez Open-Meteo. */
const OPISY_KODOW: Record<number, string> = {
  0: 'Bezchmurnie',
  1: 'Prawie bezchmurnie',
  2: 'Częściowe zachmurzenie',
  3: 'Pochmurno',
  45: 'Mgła',
  48: 'Mgła osadzająca szron',
  51: 'Mżawka słaba',
  53: 'Mżawka umiarkowana',
  55: 'Mżawka gęsta',
  56: 'Marznąca mżawka słaba',
  57: 'Marznąca mżawka gęsta',
  61: 'Deszcz słaby',
  63: 'Deszcz umiarkowany',
  65: 'Deszcz silny',
  66: 'Marznący deszcz słaby',
  67: 'Marznący deszcz silny',
  71: 'Śnieg słaby',
  73: 'Śnieg umiarkowany',
  75: 'Śnieg silny',
  77: 'Ziarna śniegu',
  80: 'Przelotny deszcz słaby',
  81: 'Przelotny deszcz umiarkowany',
  82: 'Przelotny deszcz gwałtowny',
  85: 'Przelotny śnieg słaby',
  86: 'Przelotny śnieg silny',
  95: 'Burza',
  96: 'Burza z gradem słabym',
  99: 'Burza z gradem silnym',
}

export function opisPogody(kod: number): string {
  return OPISY_KODOW[kod] ?? 'Pogoda nieznana'
}

/**
 * Pogoda dla Milanówka, odświeżana co pół godziny. Błąd sieci nie trafia do
 * wspólnego `onBlad` reszty aplikacji - pogoda jest opcjonalną kartą, nie ma
 * blokować dashboardu tak jak dziś nie blokują go Telegram czy Vulcan.
 */
export function usePogoda(): { pogoda: Pogoda | null; blad: boolean } {
  const [pogoda, setPogoda] = useState<Pogoda | null>(null)
  const [blad, setBlad] = useState(false)

  useEffect(() => {
    let aktualne = true

    async function wczytaj() {
      try {
        const odpowiedz = await fetch(zbudujUrlPogody())
        if (!odpowiedz.ok) throw new Error(String(odpowiedz.status))
        const dane = (await odpowiedz.json()) as OdpowiedzOpenMeteo
        if (aktualne) {
          setPogoda(pogodaZOdpowiedzi(dane))
          setBlad(false)
        }
      } catch {
        if (aktualne) setBlad(true)
      }
    }

    void wczytaj()
    const timer = setInterval(() => void wczytaj(), ODSWIEZANIE_MS)

    return () => {
      aktualne = false
      clearInterval(timer)
    }
  }, [])

  return { pogoda, blad }
}
