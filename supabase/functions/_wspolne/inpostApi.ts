/**
 * Mapowanie odpowiedzi API InPostu (`/v3/parcels/tracked`) na wiersze bazy.
 *
 * Ten plik nie importuje NICZEGO - ani z `src/`, ani z Deno. Dzięki temu
 * testuje się zwykłym vitestem, bez sieci i bez mockowania.
 */

/**
 * Cztery KODY statusu, przy ktorych paczka fizycznie czeka w skrytce.
 *
 * To sa kody z API (`READY_TO_PICKUP`), nie napisy pokazywane w aplikacji
 * ("Gotowa do odbioru"). Pierwsza wersja tego pliku miala tu wlasnie napisy -
 * wziete z TLUMACZEN referencyjnego klienta, nie z jego kodow - wiec zaden
 * status nigdy sie nie zgadzal. Pierwsza prawdziwa synchronizacja zwrocila
 * `DELIVERED` i bezpiecznik slusznie uznal to za nieznany status.
 */
export const STATUSY_DO_ODBIORU = [
  'READY_TO_PICKUP',
  'READY_TO_PICKUP_FROM_POK',
  'READY_TO_PICKUP_FROM_BRANCH',
  'STACK_IN_BOX_MACHINE',
]

export function czekaNaOdbior(status: string): boolean {
  return STATUSY_DO_ODBIORU.includes(status)
}

/**
 * PELNY slownik kodow statusu, jakie zna API - wszystkie 42, nie tylko koncowe.
 *
 * Ta lista NIE filtruje paczek (do tego jest `czekaNaOdbior`); sluzy WYLACZNIE
 * do odroznienia "status, ktory znamy" od "napisu, jakiego nigdy nie
 * widzielismy" - czyli sygnalu, ze InPost zmienil API. `inpost-sync` kasuje z
 * tabeli wszystko, czego nie ma na liscie "zostaja", wiec cicha zmiana
 * slownika wyczyscilaby realne, wciaz czekajace paczki.
 *
 * POPRZEDNIA wersja nazywala sie STATUSY_KONCOWE i miala osiem pozycji -
 * zakladala, ze paczka jest albo "czeka", albo "zakonczona". To bylo falszywe:
 * `/v3/parcels/tracked` zwraca rowniez paczki W DRODZE (`ADOPTED_AT_SORTING_CENTER`,
 * `OUT_FOR_DELIVERY`...), wiec pierwsza przesylka w tranzycie wywolalaby falszywy
 * alarm o zmianie API. Dlatego tu jest caly slownik, a nie jego wycinek.
 */
export const STATUSY_ZNANE = [
  'CREATED',
  'OFFERS_PREPARED',
  'OFFER_SELECTED',
  'CONFIRMED',
  'READY_TO_PICKUP_FROM_POK',
  'OVERSIZED',
  'DISPATCHED_BY_SENDER_TO_POK',
  'DISPATCHED_BY_SENDER',
  'COLLECTED_FROM_SENDER',
  'TAKEN_BY_COURIER',
  'ADOPTED_AT_SOURCE_BRANCH',
  'SENT_FROM_SOURCE_BRANCH',
  'READDRESSED',
  'OUT_FOR_DELIVERY',
  'READY_TO_PICKUP',
  'PICKUP_REMINDER_SENT',
  'PICKUP_TIME_EXPIRED',
  'AVIZO',
  'TAKEN_BY_COURIER_FROM_POK',
  'REJECTED_BY_RECEIVER',
  'UNDELIVERED',
  'DELAY_IN_DELIVERY',
  'RETURNED_TO_SENDER',
  'READY_TO_PICKUP_FROM_BRANCH',
  'DELIVERED',
  'CANCELED',
  'CLAIMED',
  'STACK_IN_CUSTOMER_SERVICE_POINT',
  'STACK_PARCEL_PICKUP_TIME_EXPIRED',
  'UNSTACK_FROM_CUSTOMER_SERVICE_POINT',
  'COURIER_AVIZO_IN_CUSTOMER_SERVICE_POINT',
  'TAKEN_BY_COURIER_FROM_CUSTOMER_SERVICE_POINT',
  'STACK_IN_BOX_MACHINE',
  'STACK_PARCEL_IN_BOX_MACHINE_PICKUP_TIME_EXPIRED',
  'UNSTACK_FROM_BOX_MACHINE',
  'ADOPTED_AT_SORTING_CENTER',
  'OUT_FOR_DELIVERY_TO_ADDRESS',
  'PICKUP_REMINDER_SENT_ADDRESS',
  'UNDELIVERED_WRONG_ADDRESS',
  'UNDELIVERED_COD_CASH_RECEIVER',
  'REDIRECT_TO_BOX',
  'CANCELED_REDIRECT_TO_BOX',
]

export type PaczkaZApi = {
  shipmentNumber: string
  status: string
  expiryDate?: string | null
  storedDate?: string | null
  sender?: { name?: string } | null
  pickUpPoint?: {
    name?: string
    // Adres jest ZAGNIEZDZONY. Plaskie `p.city`/`p.street` (pierwsza wersja)
    // zawsze dawaly `undefined`, wiec kazda paczka trafialaby do bazy z pustym
    // adresem punktu - bez zadnego bledu, po cichu.
    addressDetails?: {
      city?: string
      street?: string
      buildingNumber?: string
    } | null
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
  const adres = p.addressDetails
  if (!adres) return null
  const ulica = [adres.street, adres.buildingNumber].filter(Boolean).join(' ')
  const calosc = [ulica, adres.city].filter(Boolean).join(', ')
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
 * []` przy niepustym `parcels` - ale `/v3/parcels/tracked` z założenia
 * zwraca też paczki w stanach końcowych i w drodze (patrz `STATUSY_ZNANE`), więc
 * domownik, który ma w danej chwili WYŁĄCZNIE paczki już odebrane/zwrócone,
 * dawał dokładnie taki wynik (`wiersze: []`, `parcels` niepuste) i był
 * fałszywie alarmowany o "zmianie kształtu API", mimo że nic się nie zepsuło.
 *
 * Poprawny sygnał: nie "zero wierszy przeszło filtr", tylko "występuje status,
 * którego nie ma w słowniku
 * `STATUSY_ZNANE`" - czyli napis, jakiego jeszcze nie widzieliśmy. Rozpoznany
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
    (status) => !STATUSY_ZNANE.includes(status),
  )
}

/**
 * Odpowiedź `/v3/parcels/tracked` na wiersze `inpost_parcels`.
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

/**
 * Ciało `POST /v1/sendSMSCode` - prośba o SMS z kodem.
 *
 * Kontrakt zmieniony 2026-09-18: wcześniejszy `POST /v1/account` z numerem
 * jako obiekt `{prefix, value}` (z referencyjnej biblioteki `IFOSSA/inpost-python`,
 * zbudowanej pod stary, kilka lat nieaktualny endpoint) zwracał HTTP 200, ale
 * nigdy nie dostarczał SMS-a - potwierdzone żywym testem, patrz pamięć
 * projektu "kokpit-plan-budowy". Nowy endpoint (na wzór aktywnie rozwijanej
 * integracji `ha-parcel-integrations/ha-inpost`, potwierdzonej na żywym
 * koncie 2026-08-15) chce numeru jako PŁASKIEGO stringu.
 */
export function cialoWyslaniaKodu(phone: string): Record<string, unknown> {
  return { phoneNumber: phone }
}

/**
 * Ciało `POST /v1/confirmSMSCode` - potwierdzenie kodu.
 *
 * Platforma nazywa się tu `phoneOS` - ten sam klucz co w `POST /v1/authenticate`
 * (odświeżenie tokenu w `inpost-sync`), w odróżnieniu od starego kontraktu
 * `/v1/account/verification`, który używał `devicePlatform`.
 */
export function cialoPotwierdzeniaKodu(phone: string, kod: string): Record<string, unknown> {
  return { phoneNumber: phone, smsCode: kod, phoneOS: 'Android' }
}
