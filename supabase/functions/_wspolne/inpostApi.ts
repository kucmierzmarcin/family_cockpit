/**
 * Mapowanie odpowiedzi API InPostu (`/v4/parcels/tracked`) na wiersze bazy.
 *
 * Ten plik nie importuje NICZEGO - ani z `src/`, ani z Deno. Dzięki temu
 * testuje się zwykłym vitestem, bez sieci i bez mockowania.
 */

/**
 * Cztery statusy, przy ktorych paczka fizycznie czeka w skrytce. Dokladnie te
 * napisy zwraca API - porownujemy doslownie, bo nieznany status ma znaczyc
 * "nie czeka" (lepiej nie pokazac niz sklamac, ze cos czeka).
 */
export const STATUSY_DO_ODBIORU = [
  'Gotowa do odbioru',
  'Gotowa do odbioru w PaczkoPunkcie',
  'Gotowa do odbioru z oddziału',
  'Przesyłka magazynowana w paczkomacie tymczasowym',
]

export function czekaNaOdbior(status: string): boolean {
  return STATUSY_DO_ODBIORU.includes(status)
}

/**
 * Statusy oznaczające, że przesyłka zakończyła swoją drogę - odebrana,
 * zwrócona, anulowana albo w inny sposób "zamknięta". `/v4/parcels/tracked`
 * Z ZAŁOŻENIA zwraca też takie paczki (patrz test `naWierszePaczek` mieszający
 * status gotowy z `Doręczona` w jednej odpowiedzi) - to nie jest oznaka
 * awarii, to normalna praca API.
 *
 * Ta lista NIE służy do filtrowania (do tego jest `czekaNaOdbior`/
 * `STATUSY_DO_ODBIORU`) - służy WYŁĄCZNIE do odróżnienia "rozpoznany status
 * zakończony" od "napisu, którego w ogóle nie znamy". Domownik, który właśnie
 * odebrał swoją jedyną paczkę, ma w odpowiedzi same statusy końcowe i zero
 * "gotowa do odbioru" - to nie ma być sygnałem "API się zepsuło".
 */
export const STATUSY_KONCOWE = [
  'Doręczona',
  'Odebrana z paczkomatu',
  'Zwrócona do nadawcy',
  'Odebrana od nadawcy',
  'Odebrana przez Kuriera',
  'Anulowana',
  'Nie dostarczona',
  'Odrzucona przez odbiorcę',
]

export type PaczkaZApi = {
  shipmentNumber: string
  status: string
  expiryDate?: string | null
  storedDate?: string | null
  sender?: { name?: string } | null
  pickUpPoint?: {
    name?: string
    city?: string
    street?: string
    buildingNumber?: string
  } | null
}

export type WierszPaczki = {
  shipment_number: string
  status: string
  sender_name: string | null
  point_name: string | null
  point_address: string | null
  expiry_date: string | null
  stored_date: string | null
}

/** 'Krakowska 12, Milanówek'; brakujące części po prostu wypadają. */
function adresPunktu(p: PaczkaZApi['pickUpPoint']): string | null {
  if (!p) return null
  const ulica = [p.street, p.buildingNumber].filter(Boolean).join(' ')
  const calosc = [ulica, p.city].filter(Boolean).join(', ')
  return calosc || null
}

/**
 * Czy `odpowiedz` ma rozpoznany kształt (`{ parcels: [...] }`)?
 *
 * `naWierszePaczek` poniżej celowo zwraca `[]` zarówno dla „domownik
 * naprawdę nie ma żadnych paczek", jak i dla „API zwróciło coś, czego
 * struktura się nie zgadza" (pole `parcels` zniknęło/zmieniło nazwę/przestało
 * być tablicą) - te dwie sytuacje są nie do odróżnienia z samego wyniku
 * `naWierszePaczek`, a wywołujący (`inpost-sync`) MUSI je rozróżnić: pustą
 * listę wolno zapisać jako „nic nie czeka", ale nierozpoznanej odpowiedzi nie
 * wolno pomylić z pustą listą, bo `inpost-sync` czyści z tabeli wszystko,
 * czego nie ma na liście „zostają" - cicha zmiana kształtu API wyczyściłaby
 * wtedy realne, wciąż czekające paczki wszystkim domownikom.
 */
export function rozpoznanyKsztaltOdpowiedzi(odpowiedz: unknown): boolean {
  return Array.isArray((odpowiedz as { parcels?: unknown })?.parcels)
}

/**
 * Drugi, subtelniejszy sygnał zmiany kształtu - ten, którego
 * `rozpoznanyKsztaltOdpowiedzi` NIE łapie, bo `parcels` nadal jest tablicą.
 *
 * Precedens z tego repo: awaria `Lesson.date`/`DateAt` w Vulcanie była zmianą
 * NAZWY POLA, nie zniknięciem korzenia odpowiedzi - `parcels` przetrwałby
 * taką zmianę tak samo, jak przetrwałby zmianę NAPISU statusu (np. „Gotowa do
 * odbioru" → „Gotowa do odbioru 24/7").
 *
 * WCZEŚNIEJSZA wersja tej funkcji uznawała za podejrzane KAŻDE `wiersze:
 * []` przy niepustym `parcels` - ale `/v4/parcels/tracked` z założenia
 * zwraca też paczki w stanach końcowych (patrz `STATUSY_KONCOWE`), więc
 * domownik, który ma w danej chwili WYŁĄCZNIE paczki już odebrane/zwrócone,
 * dawał dokładnie taki wynik (`wiersze: []`, `parcels` niepuste) i był
 * fałszywie alarmowany o "zmianie kształtu API", mimo że nic się nie zepsuło.
 *
 * Poprawny sygnał: nie "zero wierszy przeszło filtr", tylko "występuje status,
 * którego nie ma ANI na liście `STATUSY_DO_ODBIORU`, ANI na liście
 * `STATUSY_KONCOWE`" - czyli napis, jakiego jeszcze nie widzieliśmy. Rozpoznany
 * status końcowy (np. `Doręczona`) to normalna praca API, nie awaria.
 */
export function zawieraNierozpoznanyStatus(odpowiedz: unknown): boolean {
  return statusyNierozpoznane(odpowiedz).length > 0
}

/**
 * Statusy z odpowiedzi, do logu - WYŁĄCZNIE statusy, nigdy całe paczki ani
 * surowa odpowiedź. Statusy nie niosą tajemnic (w przeciwieństwie do
 * `openCode` - klucza do skrytki), więc bezpiecznie trafiają do `console.warn`.
 */
export function statusyZOdpowiedzi(odpowiedz: unknown): string[] {
  const paczki = (odpowiedz as { parcels?: unknown })?.parcels
  if (!Array.isArray(paczki)) return []
  const zbior = new Set<string>()
  for (const p of paczki as PaczkaZApi[]) {
    if (p && typeof p.status === 'string') zbior.add(p.status)
  }
  return [...zbior]
}

/**
 * Podzbiór `statusyZOdpowiedzi`, który zostaje po odrzuceniu statusów
 * rozpoznanych (obu list - i "czeka na odbiór", i "zakończona"). To WŁAŚNIE
 * te napisy warto pokazać w `console.warn`/`last_error` w `inpost-sync` -
 * wypisywanie tam WSZYSTKICH statusów (łącznie z całkiem normalnym
 * `Doręczona`) myliłoby czytającego, sugerując awarię tam, gdzie jej nie ma.
 */
export function statusyNierozpoznane(odpowiedz: unknown): string[] {
  return statusyZOdpowiedzi(odpowiedz).filter(
    (status) => !STATUSY_DO_ODBIORU.includes(status) && !STATUSY_KONCOWE.includes(status),
  )
}

/**
 * Odpowiedź `/v4/parcels/tracked` na wiersze `inpost_parcels`.
 *
 * `unknown` na wejściu, bo to cudze, nieoficjalne API - kształt może się
 * zmienić bez uprzedzenia i wolimy pustą listę niż wyjątek w cronie. Wołający,
 * któremu zależy na odróżnieniu nierozpoznanej odpowiedzi od naprawdę pustej
 * listy, sprawdza to OSOBNO przez `rozpoznanyKsztaltOdpowiedzi` - ta funkcja
 * samą niejednoznaczność nie rozwiązuje, tylko nie rzuca na niej wyjątkiem.
 *
 * `openCode` NIE jest tu przepisywany i nie ma go w `WierszPaczki` - kod
 * odbioru to klucz do skrytki, patrz spec.
 */
export function naWierszePaczek(odpowiedz: unknown): WierszPaczki[] {
  const paczki = (odpowiedz as { parcels?: unknown })?.parcels
  if (!Array.isArray(paczki)) return []

  return (paczki as PaczkaZApi[])
    .filter((p) => p && typeof p.status === 'string' && czekaNaOdbior(p.status))
    .map((p) => ({
      shipment_number: String(p.shipmentNumber),
      status: p.status,
      sender_name: p.sender?.name ?? null,
      point_name: p.pickUpPoint?.name ?? null,
      point_address: adresPunktu(p.pickUpPoint),
      expiry_date: p.expiryDate ?? null,
      stored_date: p.storedDate ?? null,
    }))
}
