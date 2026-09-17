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
 * odbioru" → „Gotowa do odbioru 24/7"). W obu przypadkach `naWierszePaczek`
 * odfiltruje WSZYSTKO (żaden wiersz nie przejdzie przez `czekaNaOdbior` albo
 * przez odczyt pola), `wiersze` wyjdzie puste, a wywołujący (`inpost-sync`)
 * skasowałby wtedy WSZYSTKIE realne, wciąż czekające paczki domownika -
 * zero błędów, zero logów, bo `[]` wygląda identycznie jak legalne „wszystko
 * odebrane".
 *
 * Sygnał, który odróżnia te dwie sytuacje: `parcels` NIE jest pusta (API
 * naprawdę coś zwróciło), a mimo to `wiersze` (po przejściu przez
 * `naWierszePaczek`) jest puste. Legalne „wszystko odebrane" to `parcels: []`
 * pusta OD RAZU - to rozróżnienie musi zrobić wywołujący, samo `[]` z
 * `naWierszePaczek` go nie niesie.
 */
export function wygladaNaNiezgodnoscKsztaltu(odpowiedz: unknown, wiersze: WierszPaczki[]): boolean {
  const paczki = (odpowiedz as { parcels?: unknown })?.parcels
  return Array.isArray(paczki) && paczki.length > 0 && wiersze.length === 0
}

/**
 * Statusy z odpowiedzi, do logu - WYŁĄCZNIE statusy, nigdy całe paczki ani
 * surowa odpowiedź. Statusy nie niosą tajemnic (w przeciwieństwie do
 * `openCode` - klucza do skrytki), więc bezpiecznie trafiają do `console.warn`
 * i pomagają rozpoznać, JAKI nowy napis status InPost zaczął zwracać.
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
