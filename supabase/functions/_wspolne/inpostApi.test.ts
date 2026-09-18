import { describe, expect, it } from 'vitest'
import {
  cialoPotwierdzeniaKodu,
  cialoWyslaniaKodu,
  czekaNaOdbior,
  naWierszePaczek,
  rozpoznanyKsztaltOdpowiedzi,
  statusyNierozpoznane,
  statusyZOdpowiedzi,
  zawieraNierozpoznanyStatus,
} from './inpostApi'

describe('czekaNaOdbior', () => {
  it('rozpoznaje cztery statusy oznaczajace paczke w skrytce', () => {
    expect(czekaNaOdbior('READY_TO_PICKUP')).toBe(true)
    expect(czekaNaOdbior('READY_TO_PICKUP_FROM_POK')).toBe(true)
    expect(czekaNaOdbior('READY_TO_PICKUP_FROM_BRANCH')).toBe(true)
    expect(czekaNaOdbior('STACK_IN_BOX_MACHINE')).toBe(true)
  })

  it('odrzuca stany, w ktorych nie ma czego odbierac', () => {
    for (const s of ['DELIVERED', 'UNSTACK_FROM_BOX_MACHINE', 'RETURNED_TO_SENDER', 'CANCELED']) {
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
    status: 'READY_TO_PICKUP',
    expiryDate: '2026-09-20T18:00:00Z',
    storedDate: '2026-09-17T09:12:00Z',
    sender: { name: 'Allegro' },
    pickUpPoint: {
      name: 'MIL01A',
      addressDetails: { city: 'Milanówek', street: 'Krakowska', buildingNumber: '12' },
    },
  }

  it('sklada adres punktu z ulicy, numeru i miasta', () => {
    expect(naWierszePaczek({ parcels: [paczka] })[0]).toEqual({
      shipment_number: '640123456789',
      status: 'READY_TO_PICKUP',
      sender_name: 'Allegro',
      point_name: 'MIL01A',
      point_address: 'Krakowska 12, Milanówek',
      expiry_date: '2026-09-20T18:00:00Z',
      stored_date: '2026-09-17T09:12:00Z',
    })
  })

  it('przepuszcza wylacznie paczki czekajace na odbior', () => {
    const odpowiedz = { parcels: [paczka, { ...paczka, shipmentNumber: '999', status: 'DELIVERED' }] }
    expect(naWierszePaczek(odpowiedz).map((p) => p.shipment_number)).toEqual(['640123456789'])
  })

  it('braki w danych nie wywracaja mapowania', () => {
    const chuda = { shipmentNumber: '1', status: 'READY_TO_PICKUP' }
    expect(naWierszePaczek({ parcels: [chuda] })[0]).toEqual({
      shipment_number: '1',
      status: 'READY_TO_PICKUP',
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
    expect(rozpoznanyKsztaltOdpowiedzi({ parcels: [{ shipmentNumber: '1', status: 'READY_TO_PICKUP' }] })).toBe(
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

describe('zawieraNierozpoznanyStatus', () => {
  // Regresja, ktora ta poprawka naprawia: wczesniejsza wersja tej funkcji
  // (`wygladaNaNiezgodnoscKsztaltu`) alarmowala przy KAZDYM "zero wierszy
  // przeszlo filtr", nawet gdy wszystkie statusy byly rozpoznanymi stanami
  // koncowymi. Domownik, ktory ma w danej chwili wylacznie paczki juz
  // odebrane/zwrocone (np. wlasnie odebral swoja jedyna paczke), dostawal
  // wtedy falszywy alarm i nieaktualne wiersze zostawaly w tabeli.
  it('nie zaznacza, gdy wszystkie statusy sa rozpoznanymi stanami koncowymi (zero gotowych do odbioru)', () => {
    const odpowiedz = {
      parcels: [
        { shipmentNumber: '1', status: 'DELIVERED' },
        { shipmentNumber: '2', status: 'UNSTACK_FROM_BOX_MACHINE' },
      ],
    }
    expect(zawieraNierozpoznanyStatus(odpowiedz)).toBe(false)
  })

  it('zaznacza, gdy w odpowiedzi wystepuje status spoza obu list (nierozpoznany)', () => {
    // Symulacja zmiany napisu statusu, np. "Gotowa do odbioru" -> "Gotowa do odbioru 24/7":
    // taki napis nie jest ani na liscie "czeka na odbior", ani na liscie stanow koncowych.
    const odpowiedz = { parcels: [{ shipmentNumber: '1', status: 'READY_TO_PICKUP_247' }] }
    expect(zawieraNierozpoznanyStatus(odpowiedz)).toBe(true)
  })

  it('nie zaznacza mieszanki: jedna paczka gotowa do odbioru, jedna w stanie koncowym', () => {
    const odpowiedz = {
      parcels: [
        { shipmentNumber: '1', status: 'READY_TO_PICKUP' },
        { shipmentNumber: '2', status: 'DELIVERED' },
      ],
    }
    expect(zawieraNierozpoznanyStatus(odpowiedz)).toBe(false)
  })

  it('nie zaznacza dla pustej tablicy parcels - to legalne "nic nie czeka"', () => {
    expect(zawieraNierozpoznanyStatus({ parcels: [] })).toBe(false)
  })

  it('nie zaznacza dla nierozpoznanego ksztaltu odpowiedzi (to osobny sygnal - rozpoznanyKsztaltOdpowiedzi)', () => {
    expect(zawieraNierozpoznanyStatus({})).toBe(false)
    expect(zawieraNierozpoznanyStatus(null)).toBe(false)
  })
})

describe('statusyZOdpowiedzi', () => {
  it('zwraca unikalne statusy z paczek', () => {
    const odpowiedz = {
      parcels: [
        { shipmentNumber: '1', status: 'READY_TO_PICKUP_247' },
        { shipmentNumber: '2', status: 'READY_TO_PICKUP_247' },
        { shipmentNumber: '3', status: 'DELIVERED' },
      ],
    }
    expect(statusyZOdpowiedzi(odpowiedz)).toEqual(['READY_TO_PICKUP_247', 'DELIVERED'])
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

describe('statusyNierozpoznane', () => {
  it('pomija statusy z obu list (gotowe i koncowe), zwraca tylko nierozpoznane', () => {
    const odpowiedz = {
      parcels: [
        { shipmentNumber: '1', status: 'READY_TO_PICKUP' },
        { shipmentNumber: '2', status: 'DELIVERED' },
        { shipmentNumber: '3', status: 'READY_TO_PICKUP_247' },
      ],
    }
    expect(statusyNierozpoznane(odpowiedz)).toEqual(['READY_TO_PICKUP_247'])
  })

  it('pusta lista, gdy wszystkie statusy w odpowiedzi sa rozpoznane', () => {
    const odpowiedz = {
      parcels: [
        { shipmentNumber: '1', status: 'DELIVERED' },
        { shipmentNumber: '2', status: 'READY_TO_PICKUP' },
      ],
    }
    expect(statusyNierozpoznane(odpowiedz)).toEqual([])
  })
})

describe('statusy w drodze', () => {
  it('paczka w tranzycie to ZNANY status, nie sygnal zmiany API', () => {
    // Regresja: pierwsza wersja dzielila swiat na "czeka" i "zakonczona", a
    // `/v3/parcels/tracked` zwraca tez paczki jadace do punktu. Pierwsza taka
    // przesylka wywolalaby falszywy alarm i zablokowala cala synchronizacje.
    const wDrodze = {
      parcels: [
        { shipmentNumber: '1', status: 'ADOPTED_AT_SORTING_CENTER' },
        { shipmentNumber: '2', status: 'OUT_FOR_DELIVERY' },
        { shipmentNumber: '3', status: 'CREATED' },
      ],
    }
    expect(statusyNierozpoznane(wDrodze)).toEqual([])
    expect(zawieraNierozpoznanyStatus(wDrodze)).toBe(false)
    expect(naWierszePaczek(wDrodze)).toEqual([])
  })

  it('DELIVERED jest rozpoznany - to on zatrzymal pierwsza prawdziwa synchronizacje', () => {
    expect(statusyNierozpoznane({ parcels: [{ shipmentNumber: '1', status: 'DELIVERED' }] })).toEqual([])
  })
})

describe('cialo zadan logowania', () => {
  // Kontrakt zmieniony 2026-09-18 na wzor `ha-parcel-integrations/ha-inpost`
  // (potwierdzone na zywym koncie 2026-08-15) - POST /v1/sendSMSCode i
  // POST /v1/confirmSMSCode chca numeru jako PLASKIEGO stringu, nie obiektu
  // {prefix, value}. Stary kontrakt (POST /v1/account) nigdy nie dostarczal
  // SMS-a mimo HTTP 200 - patrz pamiec projektu "kokpit-plan-budowy".
  it('wysyla numer jako plaski string, nie jako obiekt {prefix, value}', () => {
    expect(cialoWyslaniaKodu('600100200')).toEqual({ phoneNumber: '600100200' })
  })

  it('potwierdzenie niesie plaski numer, kod i phoneOS', () => {
    expect(cialoPotwierdzeniaKodu('600100200', '123456')).toEqual({
      phoneNumber: '600100200',
      smsCode: '123456',
      phoneOS: 'Android',
    })
  })

  it('nie uzywa juz `devicePlatform` - ten sam klucz `phoneOS` co /v1/authenticate', () => {
    expect(cialoPotwierdzeniaKodu('600100200', '123456')).not.toHaveProperty('devicePlatform')
  })
})
