import { describe, expect, it } from 'vitest'
import {
  czekaNaOdbior,
  naWierszePaczek,
  rozpoznanyKsztaltOdpowiedzi,
  statusyZOdpowiedzi,
  wygladaNaNiezgodnoscKsztaltu,
} from './inpostApi'

describe('czekaNaOdbior', () => {
  it('rozpoznaje cztery statusy oznaczajace paczke w skrytce', () => {
    expect(czekaNaOdbior('Gotowa do odbioru')).toBe(true)
    expect(czekaNaOdbior('Gotowa do odbioru w PaczkoPunkcie')).toBe(true)
    expect(czekaNaOdbior('Gotowa do odbioru z oddziału')).toBe(true)
    expect(czekaNaOdbior('Przesyłka magazynowana w paczkomacie tymczasowym')).toBe(true)
  })

  it('odrzuca stany, w ktorych nie ma czego odbierac', () => {
    for (const s of ['Doręczona', 'Odebrana z paczkomatu', 'Zwrócona do nadawcy', 'Anulowana']) {
      expect(czekaNaOdbior(s)).toBe(false)
    }
  })

  it('nieznany status traktuje jak "nie czeka" - lepiej nie pokazac niz sklamac', () => {
    expect(czekaNaOdbior('Cokolwiek nowego')).toBe(false)
  })
})

describe('naWierszePaczek', () => {
  const paczka = {
    shipmentNumber: '640123456789',
    status: 'Gotowa do odbioru',
    expiryDate: '2026-09-20T18:00:00Z',
    storedDate: '2026-09-17T09:12:00Z',
    sender: { name: 'Allegro' },
    pickUpPoint: { name: 'MIL01A', city: 'Milanówek', street: 'Krakowska', buildingNumber: '12' },
  }

  it('sklada adres punktu z ulicy, numeru i miasta', () => {
    expect(naWierszePaczek({ parcels: [paczka] })[0]).toEqual({
      shipment_number: '640123456789',
      status: 'Gotowa do odbioru',
      sender_name: 'Allegro',
      point_name: 'MIL01A',
      point_address: 'Krakowska 12, Milanówek',
      expiry_date: '2026-09-20T18:00:00Z',
      stored_date: '2026-09-17T09:12:00Z',
    })
  })

  it('przepuszcza wylacznie paczki czekajace na odbior', () => {
    const odpowiedz = { parcels: [paczka, { ...paczka, shipmentNumber: '999', status: 'Doręczona' }] }
    expect(naWierszePaczek(odpowiedz).map((p) => p.shipment_number)).toEqual(['640123456789'])
  })

  it('braki w danych nie wywracaja mapowania', () => {
    const chuda = { shipmentNumber: '1', status: 'Gotowa do odbioru' }
    expect(naWierszePaczek({ parcels: [chuda] })[0]).toEqual({
      shipment_number: '1',
      status: 'Gotowa do odbioru',
      sender_name: null,
      point_name: null,
      point_address: null,
      expiry_date: null,
      stored_date: null,
    })
  })

  it('odpowiedz bez tablicy paczek to pusta lista, nie wyjatek', () => {
    expect(naWierszePaczek({})).toEqual([])
    expect(naWierszePaczek(null)).toEqual([])
  })

  it('NIGDY nie przepisuje openCode - to klucz do skrytki', () => {
    // Wartość kodu celowo inna niż jakikolwiek fragment `shipmentNumber` z `paczka`
    // (ten zawiera '123456' jako podciąg) - inaczej test przechodziłby przez
    // przypadek, bo shipment_number i tak trafia do wiersza.
    const zKodem = { ...paczka, openCode: '987654' }
    const wiersz = naWierszePaczek({ parcels: [zKodem] })[0]
    expect(JSON.stringify(wiersz)).not.toContain('987654')
    expect('open_code' in wiersz).toBe(false)
  })
})

describe('rozpoznanyKsztaltOdpowiedzi', () => {
  it('rozpoznaje odpowiedz z tablica parcels (pusta lub nie)', () => {
    expect(rozpoznanyKsztaltOdpowiedzi({ parcels: [] })).toBe(true)
    expect(rozpoznanyKsztaltOdpowiedzi({ parcels: [{ shipmentNumber: '1', status: 'Gotowa do odbioru' }] })).toBe(
      true,
    )
  })

  it('odrzuca odpowiedz bez tablicy parcels - to sygnal zmiany ksztaltu API, nie "brak paczek"', () => {
    expect(rozpoznanyKsztaltOdpowiedzi({})).toBe(false)
    expect(rozpoznanyKsztaltOdpowiedzi(null)).toBe(false)
    expect(rozpoznanyKsztaltOdpowiedzi({ parcels: null })).toBe(false)
    expect(rozpoznanyKsztaltOdpowiedzi({ parcels: 'nie-tablica' })).toBe(false)
    expect(rozpoznanyKsztaltOdpowiedzi({ paczki: [] })).toBe(false)
  })
})

describe('wygladaNaNiezgodnoscKsztaltu', () => {
  it('zaznacza podejrzenie, gdy API zwrocilo paczki, ale zadna nie przeszla przez naWierszePaczek', () => {
    // Symulacja zmiany napisu statusu, np. "Gotowa do odbioru" -> "Gotowa do odbioru 24/7":
    // `parcels` niepusta, ale `czekaNaOdbior` nie rozpoznaje nowego napisu.
    const odpowiedz = { parcels: [{ shipmentNumber: '1', status: 'Gotowa do odbioru 24/7' }] }
    expect(wygladaNaNiezgodnoscKsztaltu(odpowiedz, naWierszePaczek(odpowiedz))).toBe(true)
  })

  it('nie zaznacza legalnego "wszystko odebrane" (parcels puste od razu)', () => {
    const odpowiedz = { parcels: [] }
    expect(wygladaNaNiezgodnoscKsztaltu(odpowiedz, naWierszePaczek(odpowiedz))).toBe(false)
  })

  it('nie zaznacza, gdy przynajmniej jedna paczka poprawnie przeszla filtr', () => {
    const odpowiedz = {
      parcels: [
        { shipmentNumber: '1', status: 'Gotowa do odbioru' },
        { shipmentNumber: '2', status: 'Doręczona' },
      ],
    }
    expect(wygladaNaNiezgodnoscKsztaltu(odpowiedz, naWierszePaczek(odpowiedz))).toBe(false)
  })

  it('nie zaznacza dla nierozpoznanego ksztaltu odpowiedzi (to osobny sygnal)', () => {
    expect(wygladaNaNiezgodnoscKsztaltu({}, [])).toBe(false)
    expect(wygladaNaNiezgodnoscKsztaltu(null, [])).toBe(false)
  })
})

describe('statusyZOdpowiedzi', () => {
  it('zwraca unikalne statusy z paczek', () => {
    const odpowiedz = {
      parcels: [
        { shipmentNumber: '1', status: 'Gotowa do odbioru 24/7' },
        { shipmentNumber: '2', status: 'Gotowa do odbioru 24/7' },
        { shipmentNumber: '3', status: 'Doręczona' },
      ],
    }
    expect(statusyZOdpowiedzi(odpowiedz)).toEqual(['Gotowa do odbioru 24/7', 'Doręczona'])
  })

  it('nigdy nie zwraca calych paczek ani innych pol - tylko napisy statusow', () => {
    const odpowiedz = { parcels: [{ shipmentNumber: '1', status: 'X', openCode: '987654' }] }
    expect(statusyZOdpowiedzi(odpowiedz)).toEqual(['X'])
  })

  it('pusta lista dla nierozpoznanego ksztaltu', () => {
    expect(statusyZOdpowiedzi({})).toEqual([])
    expect(statusyZOdpowiedzi(null)).toEqual([])
  })
})
