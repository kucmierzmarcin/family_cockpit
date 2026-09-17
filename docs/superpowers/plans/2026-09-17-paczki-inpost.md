# Paczki InPost — plan wdrożenia

> **Dla agentów:** WYMAGANY SUB-SKILL: użyj `superpowers:subagent-driven-development`
> (zalecane) albo `superpowers:executing-plans`, żeby wykonać ten plan zadanie po
> zadaniu. Kroki mają checkboxy (`- [ ]`) do odhaczania.

**Cel:** Pokazać domownikowi, co czeka na niego w paczkomacie i do kiedy ma to
odebrać — bez otwierania aplikacji InPost i bez szukania SMS-a.

**Architektura:** Świadoma kopia integracji z Vulcanem. Poświadczenia w tabeli
z włączonym RLS i zerową liczbą polityk (dostęp tylko `service_role`), dane
merytoryczne czytane przez cały dom bez zapisu z klienta, bezpieczna projekcja
SQL zamiast tokenu, osobna funkcja brzegowa do parowania i osobna do
synchronizacji, padnięta sesja jako status a nie wyjątek. Różnica wobec
Vulcana: połączenie jest per domownik, nie per dom.

**Stack:** React 19 + TypeScript + Vite 8, vitest 5, Supabase (Postgres 17,
RLS, Edge Functions/Deno, pg_cron, pg_net, Vault), prywatne API mobilne InPost.

**Spec:** [`docs/superpowers/specs/2026-09-17-paczki-inpost-design.md`](../specs/2026-09-17-paczki-inpost-design.md)

## Ograniczenia globalne

- Gałąź: `paczki-inpost`, odbita od `main`. Nie commitować na `main`.
- Nazwy kolumn w bazie po angielsku, nazwy funkcji i polityk po polsku — tak
  jest w całym `supabase/schema.sql`.
- Host API: `https://api-inmobile-pl.easypack24.net`. Nigdzie indziej.
- **`openCode` nie trafia do bazy ani do klienta.** Nie dodawać kolumny, nie
  zwracać pola, nie logować. To klucz do skrytki.
- Statusy znaczące „czeka do odbioru" (dokładnie te cztery, dosłownie):
  `Gotowa do odbioru`, `Gotowa do odbioru w PaczkoPunkcie`,
  `Gotowa do odbioru z oddziału`, `Przesyłka magazynowana w paczkomacie tymczasowym`.
- `supabase/` zostaje poza `tsconfig.app.json` (już tak jest — `include: ["src"]`),
  więc pliki Deno nie trafiają do `npm run build`. Testy w
  `supabase/functions/_wspolne/*.test.ts` uruchamia zwykły vitest.
- Każdy commit kończy się stopką `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Po każdym zadaniu: `npx tsc -b`, `npx vitest run`, `npx oxlint` — zero nowych
  ostrzeżeń, zero błędów.

---

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `supabase/schema.sql` (modyfikacja) | Dwie tabele, RLS, bezpieczna projekcja, harmonogram cron |
| `supabase/functions/_wspolne/inpostApi.ts` (nowy) | Czyste mapowanie odpowiedzi API → wiersz bazy + filtr statusów. Bez sieci, bez Deno-specyficznych API |
| `supabase/functions/inpost-polacz/index.ts` (nowy) | Parowanie: wyślij SMS → potwierdź kod → zapisz tokeny |
| `supabase/functions/inpost-sync/index.ts` (nowy) | Odśwież token, pobierz paczki, zapisz stan bieżący |
| `src/paczki.ts` (nowy) | Domena klienta: typ `Paczka`, mapowanie z wiersza bazy, pilność terminu, sortowanie |
| `src/useInpost.ts` (nowy) | Hak: status połączeń + paczki domu, na żywo |
| `src/Paczki.tsx` (nowy) | Ekran „Paczki" |
| `src/style/paczki.css` (nowy) | Style ekranu |
| `src/uklad/nawigacja.ts` (modyfikacja) | Nowy ekran w `Ekran`, `TYTULY`, `SLUGI`, `EKRANY`, `EKRANY_WIECEJ` |
| `src/dashboardLiczniki.ts` (modyfikacja) | `liczPaczkiDoOdbioru` |
| `src/uklad/ParowanieInpost.tsx` (nowy) | Parowanie numeru: SMS → kod; tu też mieszka typ `StatusInpost` |
| `src/MojDom.tsx` (modyfikacja) | Sekcja parowania InPostu |

---

## Task 1: Schemat bazy

**Files:**
- Modify: `supabase/schema.sql` (dopisać na końcu, przed sekcją harmonogramów)

**Interfaces:**
- Produces: tabele `public.inpost_connections`, `public.inpost_parcels`;
  funkcja `public.status_polaczenia_inpost()` zwracająca
  `(member_id uuid, imie text, phone text, status text, ostatni_blad text)`

- [ ] **Krok 1: Dopisz tabele**

```sql
-- ===== Paczki InPost =====
-- Poswiadczenia per DOMOWNIK (nie per dom, jak Vulcan) - InPost wiaze konto z
-- numerem telefonu konkretnej osoby. RLS wlaczone i CELOWO bez zadnej polityki:
-- dostep wylacznie service_role, tak jak vulcan_connections.
create table if not exists public.inpost_connections (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.members(id) on delete cascade,
  household_id      uuid not null references public.households(id) on delete cascade,
  phone             text not null,
  auth_token        text not null,
  refresh_token     text not null,
  token_expires_at  timestamptz,
  status            text not null default 'aktywne',
  last_error        text,
  created_at        timestamptz not null default now(),
  constraint inpost_connections_status_check
    check (status in ('aktywne', 'wymaga_ponownego_logowania')),
  unique (member_id)
);

-- Stan biezacy, nie historia: wiersz znika, gdy paczka przestaje czekac.
-- Kolumny open_code NIE MA i miec nie bedzie - to klucz do skrytki.
create table if not exists public.inpost_parcels (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  member_id        uuid not null references public.members(id) on delete cascade,
  shipment_number  text not null,
  status           text not null,
  sender_name      text,
  point_name       text,
  point_address    text,
  expiry_date      timestamptz,
  stored_date      timestamptz,
  updated_at       timestamptz not null default now(),
  unique (member_id, shipment_number)
);

create index if not exists inpost_parcels_dom_idx
  on public.inpost_parcels (household_id, expiry_date);
```

- [ ] **Krok 2: Dopisz RLS**

```sql
alter table public.inpost_connections enable row level security;
alter table public.inpost_parcels     enable row level security;

-- inpost_connections: CELOWO bez zadnej polityki dla authenticated/anon -
-- trzyma tokeny, dostep wylacznie service_role (wzorzec vulcan_connections).

drop policy if exists "Paczki InPost - odczyt" on public.inpost_parcels;
create policy "Paczki InPost - odczyt" on public.inpost_parcels
  for select to authenticated
  using (household_id = public.moj_dom());
-- Zapisu z klienta nie ma wcale: dane plyna tylko z Edge Function kluczem
-- serwisowym, ktory i tak omija RLS.
```

- [ ] **Krok 3: Dopisz bezpieczną projekcję**

```sql
-- Stan polaczen domu BEZ poswiadczen. Numer skrocony do trzech ostatnich cyfr -
-- wystarczy, zeby domownik poznal swoj, a nie wystarczy, zeby go uzyc.
create or replace function public.status_polaczenia_inpost()
  returns table (member_id uuid, imie text, phone text, status text, ostatni_blad text)
  language sql stable security definer set search_path = public
as $$
  select c.member_id,
         m.name,
         '•••' || right(c.phone, 3),
         c.status,
         c.last_error
  from public.inpost_connections c
  join public.members m on m.id = c.member_id
  where c.household_id = public.moj_dom()
$$;

grant execute on function public.status_polaczenia_inpost() to authenticated;
```

- [ ] **Krok 4: Dopisz harmonogram**

```sql
-- Co 30 minut: termin odbioru liczy sie w dniach, nie minutach.
select cron.schedule('inpost-sync', '*/30 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets
                 where name = 'kokpit_url_funkcji_inpost_sync'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' ||
                   (select decrypted_secret from vault.decrypted_secrets
                     where name = 'kokpit_klucz_serwisowy')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);
```

- [ ] **Krok 5: Zastosuj schemat i sprawdź, że poświadczenia są niedostępne z klienta**

Wklej zmieniony fragment w SQL Editor Supabase. Potem, jako **zalogowany
użytkownik** (nie service_role), sprawdź w konsoli przeglądarki na
`http://localhost:5173`:

```js
// Musi zwrocic zero wierszy albo blad uprawnien - NIGDY tokenow.
await supabase.from('inpost_connections').select('*')
// Musi zadzialac i zwrocic numer w postaci •••789
await supabase.rpc('status_polaczenia_inpost')
```

Oczekiwane: pierwsze zapytanie zwraca pustą tablicę (RLS bez polityki),
drugie działa.

- [ ] **Krok 6: Commit**

```bash
git add supabase/schema.sql
git commit -m "Paczki InPost: schemat, RLS i bezpieczna projekcja

Tabele inpost_connections (per domownik) i inpost_parcels (stan biezacy).
Poswiadczenia z wlaczonym RLS i ZEROWA liczba polityk - dostep wylacznie
service_role, wzorzec vulcan_connections. Kolumny open_code celowo nie ma:
to klucz do skrytki i nie ma czego szukac w bazie.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Czyste mapowanie odpowiedzi API

**Files:**
- Create: `supabase/functions/_wspolne/inpostApi.ts`
- Test: `supabase/functions/_wspolne/inpostApi.test.ts`

**Interfaces:**
- Produces:
  - `export const STATUSY_DO_ODBIORU: string[]`
  - `export function czekaNaOdbior(status: string): boolean`
  - `export type PaczkaZApi = { shipmentNumber: string; status: string; expiryDate: string | null; storedDate: string | null; sender?: { name?: string } | null; pickUpPoint?: { name?: string; city?: string; street?: string; buildingNumber?: string } | null }`
  - `export type WierszPaczki = { shipment_number: string; status: string; sender_name: string | null; point_name: string | null; point_address: string | null; expiry_date: string | null; stored_date: string | null }`
  - `export function naWierszePaczek(odpowiedz: unknown): WierszPaczki[]`

- [ ] **Krok 1: Napisz test, który ma się nie udać**

```ts
// supabase/functions/_wspolne/inpostApi.test.ts
import { describe, expect, it } from 'vitest'
import { czekaNaOdbior, naWierszePaczek } from './inpostApi'

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
    const zKodem = { ...paczka, openCode: '123456' }
    const wiersz = naWierszePaczek({ parcels: [zKodem] })[0]
    expect(JSON.stringify(wiersz)).not.toContain('123456')
    expect('open_code' in wiersz).toBe(false)
  })
})
```

- [ ] **Krok 2: Uruchom test i upewnij się, że nie przechodzi**

Run: `npx vitest run supabase/functions/_wspolne/inpostApi.test.ts`
Oczekiwane: FAIL — „Failed to load ./inpostApi".

- [ ] **Krok 3: Napisz minimalną implementację**

```ts
// supabase/functions/_wspolne/inpostApi.ts

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
 * Odpowiedź `/v4/parcels/tracked` na wiersze `inpost_parcels`.
 *
 * `unknown` na wejściu, bo to cudze, nieoficjalne API - kształt może się
 * zmienić bez uprzedzenia i wolimy pustą listę niż wyjątek w cronie.
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
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

Run: `npx vitest run supabase/functions/_wspolne/inpostApi.test.ts`
Oczekiwane: PASS, 6 testów.

- [ ] **Krok 5: Commit**

```bash
git add supabase/functions/_wspolne/inpostApi.ts supabase/functions/_wspolne/inpostApi.test.ts
git commit -m "Paczki InPost: mapowanie odpowiedzi API na wiersze bazy

Czysta funkcja bez sieci i bez Deno, wiec testowalna zwyklym vitestem.
Nieznany status znaczy 'nie czeka' - lepiej nie pokazac niz sklamac, ze
cos czeka. Osobny test pilnuje, ze openCode nigdy nie trafia do wiersza.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Funkcja brzegowa `inpost-polacz`

**Files:**
- Create: `supabase/functions/inpost-polacz/index.ts`

**Interfaces:**
- Consumes: nic z wcześniejszych zadań
- Produces: endpoint przyjmujący `{ krok: 'sms', phone }` albo
  `{ krok: 'potwierdz', phone, kod }`, zwracający `{ ok: true }` albo `{ blad: string }`

- [ ] **Krok 1: Napisz funkcję**

```ts
// supabase/functions/inpost-polacz/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2'

const HOST = 'https://api-inmobile-pl.easypack24.net'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Cialo = { krok?: 'sms' | 'potwierdz'; phone?: string; kod?: string }

function json(dane: unknown, status = 200): Response {
  return new Response(JSON.stringify(dane), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

const blad = (tekst: string, status: number) => json({ blad: tekst }, status)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return blad('Tylko POST.', 405)

  let cialo: Cialo
  try {
    cialo = await req.json()
  } catch {
    return blad('Nieprawidłowy JSON.', 400)
  }

  const phone = (cialo.phone ?? '').replace(/\D/g, '')
  if (phone.length !== 9) return blad('Podaj dziewięciocyfrowy numer telefonu.', 400)

  // Krok 1: poprosic InPost o SMS. Nic nie zapisujemy - dopoki kod nie zostanie
  // potwierdzony, nie mamy zadnego dowodu, ze numer nalezy do tej osoby.
  if (cialo.krok === 'sms') {
    const odp = await fetch(`${HOST}/v1/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone }),
    })
    if (!odp.ok) return blad(`InPost odrzucił prośbę o kod (HTTP ${odp.status}).`, 502)
    return json({ ok: true })
  }

  if (cialo.krok !== 'potwierdz') return blad('Nieznany krok.', 400)

  const kod = (cialo.kod ?? '').replace(/\D/g, '')
  if (kod.length === 0) return blad('Podaj kod z SMS-a.', 400)

  const odp = await fetch(`${HOST}/v1/account/verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phone, smsCode: kod }),
  })
  if (!odp.ok) return blad('Kod niepoprawny albo wygasł.', 400)

  const tokeny = (await odp.json()) as {
    authToken?: string
    refreshToken?: string
  }
  if (!tokeny.authToken || !tokeny.refreshToken) {
    return blad('InPost nie zwrócił tokenów - kształt odpowiedzi się zmienił.', 502)
  }

  // Domownika bierzemy z JWT wolajacego, NIE z ciala zadania - inaczej kazdy
  // moglby podpiac swoj numer pod cudze konto.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const { data: uzytkownik } = await supabase.auth.getUser(jwt)
  if (!uzytkownik?.user) return blad('Brak zalogowanego użytkownika.', 401)

  const { data: domownik } = await supabase
    .from('members')
    .select('id, household_id')
    .eq('user_id', uzytkownik.user.id)
    .single()
  if (!domownik) return blad('Nie znaleziono domownika.', 404)

  const { error } = await supabase.from('inpost_connections').upsert(
    {
      member_id: domownik.id,
      household_id: domownik.household_id,
      phone,
      auth_token: tokeny.authToken,
      refresh_token: tokeny.refreshToken,
      status: 'aktywne',
      last_error: null,
    },
    { onConflict: 'member_id' },
  )
  if (error) return blad(`Nie udało się zapisać połączenia: ${error.message}`, 500)

  return json({ ok: true })
})
```

- [ ] **Krok 2: Wdróż funkcję**

Run: `supabase functions deploy inpost-polacz`
Oczekiwane: wdrożenie bez błędów.

- [ ] **Krok 3: Sprawdź, że odrzuca śmieci**

```bash
curl -s -X POST "$URL_FUNKCJI/inpost-polacz" \
  -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"krok":"sms","phone":"123"}'
```

Oczekiwane: `{"blad":"Podaj dziewięciocyfrowy numer telefonu."}`

- [ ] **Krok 4: Commit**

```bash
git add supabase/functions/inpost-polacz/index.ts
git commit -m "Paczki InPost: funkcja parowania numeru telefonu

Dwa kroki: wyslij SMS, potwierdz kod. Domownika bierzemy z JWT wolajacego,
nie z ciala zadania - inaczej kazdy moglby podpiac swoj numer pod cudze
konto. Przy kroku 'sms' nic nie zapisujemy: dopoki kod nie jest potwierdzony,
nie mamy dowodu, ze numer nalezy do tej osoby.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Parowanie w ekranie „Mój dom"

**Files:**
- Create: `src/uklad/ParowanieInpost.tsx`
- Modify: `src/MojDom.tsx`

**Interfaces:**
- Consumes: funkcja brzegowa `inpost-polacz` z Taska 3
- Produces: komponent `<ParowanieInpost polaczenie={...} onZmiana={...} />`

- [ ] **Krok 1: Napisz komponent parowania**

```tsx
// src/uklad/ParowanieInpost.tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Stan połączenia z InPostem, tak jak zwraca go `status_polaczenia_inpost()`.
 *
 * Typ mieszka tutaj, a nie w `useInpost`, bo ten komponent jest jego pierwszym
 * konsumentem i powstaje wcześniej. Hak zaimportuje go stąd - ten sam układ co
 * `Widok` eksportowany z `SterowanieKalendarza.tsx` i używany przez `trasa.ts`.
 */
export type StatusInpost = {
  memberId: string
  imie: string
  phone: string
  status: 'aktywne' | 'wymaga_ponownego_logowania'
  ostatniBlad: string | null
}

type Props = {
  /** Połączenie tego domownika albo `null`, gdy jeszcze nie sparował numeru. */
  polaczenie: StatusInpost | null
  onZmiana: () => void
}

/**
 * Dwa kroki parowania w jednym komponencie: numer → SMS → kod.
 *
 * Numer i kod idą wprost do funkcji brzegowej i nigdzie się nie zatrzymują -
 * przeglądarka nie zapisuje ich ani w stanie po zakończeniu, ani w bazie.
 */
export function ParowanieInpost({ polaczenie, onZmiana }: Props) {
  const [etap, setEtap] = useState<'numer' | 'kod'>('numer')
  const [phone, setPhone] = useState('')
  const [kod, setKod] = useState('')
  const [blad, setBlad] = useState<string | null>(null)
  const [zapisywanie, setZapisywanie] = useState(false)

  async function wyslij(krok: 'sms' | 'potwierdz') {
    setZapisywanie(true)
    setBlad(null)
    const { data, error } = await supabase.functions.invoke('inpost-polacz', {
      body: krok === 'sms' ? { krok, phone } : { krok, phone, kod },
    })
    setZapisywanie(false)

    if (error || (data as { blad?: string })?.blad) {
      setBlad((data as { blad?: string })?.blad ?? 'Nie udało się połączyć z InPostem.')
      return
    }

    if (krok === 'sms') {
      setEtap('kod')
    } else {
      setKod('')
      setPhone('')
      setEtap('numer')
      onZmiana()
    }
  }

  if (polaczenie && polaczenie.status === 'aktywne') {
    return (
      <div className="karta">
        <h2 className="panel-tytul">Paczki InPost</h2>
        <p className="polaczono">Połączono z numerem {polaczenie.phone}</p>
      </div>
    )
  }

  return (
    <div className="karta">
      <h2 className="panel-tytul">Paczki InPost</h2>

      {polaczenie?.status === 'wymaga_ponownego_logowania' && (
        <p className="blad" role="alert">
          Sesja InPostu wygasła - zaloguj się ponownie kodem SMS.
        </p>
      )}

      {blad && (
        <p className="blad" role="alert">
          {blad}
        </p>
      )}

      {etap === 'numer' ? (
        <div className="formularz">
          <label htmlFor="inpost-telefon">Numer telefonu w InPoście</label>
          <input
            id="inpost-telefon"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="np. 600100200"
            maxLength={15}
          />
          <button
            type="button"
            disabled={zapisywanie || phone.replace(/\D/g, '').length !== 9}
            onClick={() => void wyslij('sms')}
          >
            {zapisywanie ? 'Wysyłam…' : 'Wyślij kod SMS'}
          </button>
        </div>
      ) : (
        <div className="formularz">
          <label htmlFor="inpost-kod">Kod z SMS-a</label>
          <input
            id="inpost-kod"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={kod}
            onChange={(e) => setKod(e.target.value)}
            maxLength={8}
          />
          <button type="button" disabled={zapisywanie || !kod.trim()} onClick={() => void wyslij('potwierdz')}>
            {zapisywanie ? 'Sprawdzam…' : 'Połącz'}
          </button>
          <button type="button" className="drobny" onClick={() => setEtap('numer')}>
            Zmień numer
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Krok 2: Podepnij w `MojDom.tsx`**

Dodaj do `Props` ekranu: `polaczenieInpost: StatusInpost | null` oraz
`onOdswiezInpost: () => void`, a w drzewie - pod sekcją Vulcana:

```tsx
<ParowanieInpost polaczenie={polaczenieInpost} onZmiana={onOdswiezInpost} />
```

W `App.tsx` przekaż odpowiednio
`polaczenieInpost={inpost.polaczenia.find((p) => p.memberId === profil.id) ?? null}`
oraz `onOdswiezInpost={() => void inpost.odswiez()}`.

> Kolejność zadań: `useInpost` powstaje dopiero w Tasku 8. Do czasu jego
> powstania zaślep te dwa propsy wartościami `null` i `() => {}` w `App.tsx`,
> a w Tasku 8 podłącz prawdziwe. To jedyne miejsce w planie z taką zaślepką -
> alternatywą byłoby budowanie ekranu przed możliwością sparowania konta.

- [ ] **Krok 3: Sprawdź w przeglądarce**

Run: `npm run dev`, wejdź na `#/dom`.
Oczekiwane: sekcja „Paczki InPost" z polem na numer; przycisk nieaktywny,
dopóki numer nie ma dziewięciu cyfr.

- [ ] **Krok 4: Commit**

```bash
git add src/uklad/ParowanieInpost.tsx src/MojDom.tsx src/App.tsx
git commit -m "Paczki InPost: parowanie numeru w ekranie Moj dom

Numer i kod ida wprost do funkcji brzegowej i nigdzie sie nie zatrzymuja -
przegladarka nie trzyma ich po zakonczeniu. Wygasla sesja pokazuje sie tu
jako komunikat z prosba o ponowne zalogowanie, tak jak przy Vulcanie.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Funkcja brzegowa `inpost-sync`

**Files:**
- Create: `supabase/functions/inpost-sync/index.ts`

**Interfaces:**
- Consumes: `naWierszePaczek` z `../_wspolne/inpostApi.ts`
- Produces: endpoint bez ciała, synchronizujący wszystkie aktywne połączenia

- [ ] **Krok 1: Napisz funkcję**

```ts
// supabase/functions/inpost-sync/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { naWierszePaczek } from '../_wspolne/inpostApi.ts'

const HOST = 'https://api-inmobile-pl.easypack24.net'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Polaczenie = {
  member_id: string
  household_id: string
  auth_token: string
  refresh_token: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: polaczenia } = await supabase
    .from('inpost_connections')
    .select('member_id, household_id, auth_token, refresh_token')
    .eq('status', 'aktywne')

  let zsynchronizowane = 0

  for (const p of (polaczenia ?? []) as Polaczenie[]) {
    try {
      // Odswiezamy token bezwarunkowo: jest tani, a InPost nie mowi wprost,
      // kiedy stary przestanie dzialac.
      const odswiez = await fetch(`${HOST}/v1/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: p.refresh_token, phoneOS: 'Android' }),
      })

      if (!odswiez.ok) {
        // Padnieta sesja to STATUS, nie wyjatek - jeden domownik nie moze
        // zatrzymac synchronizacji pozostalych.
        await supabase
          .from('inpost_connections')
          .update({
            status: 'wymaga_ponownego_logowania',
            last_error: `Odświeżenie sesji nie powiodło się (HTTP ${odswiez.status}).`,
          })
          .eq('member_id', p.member_id)
        continue
      }

      const { authToken, refreshToken } = (await odswiez.json()) as {
        authToken: string
        refreshToken?: string
      }

      await supabase
        .from('inpost_connections')
        .update({
          auth_token: authToken,
          refresh_token: refreshToken ?? p.refresh_token,
          last_error: null,
        })
        .eq('member_id', p.member_id)

      const odp = await fetch(`${HOST}/v4/parcels/tracked`, {
        headers: { Authorization: authToken },
      })
      if (!odp.ok) throw new Error(`Pobranie paczek nie powiodło się (HTTP ${odp.status}).`)

      const wiersze = naWierszePaczek(await odp.json())

      if (wiersze.length > 0) {
        await supabase.from('inpost_parcels').upsert(
          wiersze.map((w) => ({
            ...w,
            member_id: p.member_id,
            household_id: p.household_id,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'member_id,shipment_number' },
        )
      }

      // Stan biezacy, nie historia: co znika z API, znika z tabeli.
      const zostaja = wiersze.map((w) => w.shipment_number)
      const usun = supabase.from('inpost_parcels').delete().eq('member_id', p.member_id)
      await (zostaja.length > 0 ? usun.not('shipment_number', 'in', `(${zostaja.join(',')})`) : usun)

      zsynchronizowane++
    } catch (e) {
      await supabase
        .from('inpost_connections')
        .update({ last_error: e instanceof Error ? e.message : String(e) })
        .eq('member_id', p.member_id)
    }
  }

  return new Response(JSON.stringify({ zsynchronizowane }), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
})
```

- [ ] **Krok 2: Wdróż**

Run: `supabase functions deploy inpost-sync`

- [ ] **Krok 3: Wywołaj bez żadnego połączenia w bazie**

```bash
curl -s -X POST "$URL_FUNKCJI/inpost-sync" -H "Authorization: Bearer $KLUCZ_SERWISOWY"
```

Oczekiwane: `{"zsynchronizowane":0}` — brak połączeń to nie błąd.

- [ ] **Krok 4: Commit**

```bash
git add supabase/functions/inpost-sync/index.ts
git commit -m "Paczki InPost: cykliczna synchronizacja paczek

Padnieta sesja jednego domownika nie zatrzymuje pozostalych - to status w
bazie, nie wyjatek przerywajacy petle. Tabela trzyma stan biezacy: co znika
z API, znika z tabeli, zadnej historii odebranych paczek.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Żywe parowanie i weryfikacja kształtu odpowiedzi

> **To zadanie wykonuje WŁAŚCICIEL KONTA, nie agent.** Parowanie wymaga
> prawdziwego numeru telefonu i kodu SMS. Żaden agent nie wpisuje cudzych
> poświadczeń.

**Files:**
- Modify (tylko jeśli żywy zrzut tego wymaga): `supabase/functions/_wspolne/inpostApi.ts`, `supabase/functions/_wspolne/inpostApi.test.ts`

- [ ] **Krok 1: Sparuj numer przez `curl`**

```bash
# 1. Popros o SMS
curl -s -X POST "$URL_FUNKCJI/inpost-polacz" \
  -H "Authorization: Bearer $TWOJ_JWT" -H "Content-Type: application/json" \
  -d '{"krok":"sms","phone":"XXXXXXXXX"}'

# 2. Potwierdz kodem, ktory przyszedl SMS-em
curl -s -X POST "$URL_FUNKCJI/inpost-polacz" \
  -H "Authorization: Bearer $TWOJ_JWT" -H "Content-Type: application/json" \
  -d '{"krok":"potwierdz","phone":"XXXXXXXXX","kod":"NNNNNN"}'
```

Oczekiwane: `{"ok":true}` i wiersz w `inpost_connections`.

- [ ] **Krok 2: Zrzuć surową odpowiedź `/v4/parcels/tracked`**

Dopisz **tymczasowo** w `inpost-sync`, zaraz po `const odp = await fetch(...)`:

```ts
console.log('SUROWA ODPOWIEDZ:', JSON.stringify(await odp.clone().json()).slice(0, 4000))
```

Wdróż, wywołaj funkcję, odczytaj logi: `supabase functions logs inpost-sync`.

- [ ] **Krok 3: Porównaj z założeniami Taska 2**

Sprawdź w zrzucie **nazwy pól**: czy tablica nazywa się `parcels`, czy pola to
`shipmentNumber`, `expiryDate`, `storedDate`, `sender.name`, `pickUpPoint.*`.
To ten sam rodzaj weryfikacji, który w Vulcanie złapał rozjazd `Date`/`DateAt`.

Jeśli cokolwiek się różni — popraw `naWierszePaczek` **i dopisz test na
prawdziwy kształt**, zanim ruszysz dalej.

- [ ] **Krok 4: Usuń tymczasowy log i wdróż ponownie**

Log zawiera `openCode` prawdziwych paczek. **Musi zniknąć z kodu i z logów**
zanim cokolwiek pójdzie dalej.

Run: `supabase functions deploy inpost-sync` oraz, jeśli konsola na to pozwala,
wyczyść logi funkcji.

- [ ] **Krok 5: Commit (tylko jeśli mapowanie wymagało korekty)**

```bash
git add supabase/functions/_wspolne/inpostApi.ts supabase/functions/_wspolne/inpostApi.test.ts
git commit -m "Paczki InPost: popraw mapowanie wedlug zywej odpowiedzi API

Zrzut surowej odpowiedzi /v4/parcels/tracked pokazal rozjazd nazw pol
(wpisz tutaj konkretnie ktorych - ta linijka jest jedyna rzecza w tym planie,
ktorej nie da sie ustalic przed zywym testem).
Testy dopisane na prawdziwy ksztalt, nie na zalozony.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Domena klienta i nawigacja

**Files:**
- Create: `src/paczki.ts`
- Test: `src/paczki.test.ts`
- Modify: `src/uklad/nawigacja.ts`
- Modify: `src/uklad/nawigacja.test.ts`

**Interfaces:**
- Produces:
  - `export type Paczka = { id: string; memberId: string; numer: string; status: string; nadawca: string | null; punkt: string | null; adres: string | null; odbierzDo: Date | null }`
  - `export function paczkaZBazy(w: PaczkaDb): Paczka`
  - `export function czyPilna(odbierzDo: Date | null, teraz: Date): boolean`
  - `export function posortujPaczki(p: Paczka[]): Paczka[]`
  - `Ekran` rozszerzony o `'paczki'`

- [ ] **Krok 1: Napisz testy domeny**

```ts
// src/paczki.test.ts
import { describe, expect, it } from 'vitest'
import { czyPilna, posortujPaczki, type Paczka } from './paczki'

const TERAZ = new Date(2026, 8, 17, 10, 0)
const p = (numer: string, odbierzDo: Date | null): Paczka => ({
  id: numer, memberId: 'm', numer, status: 'Gotowa do odbioru',
  nadawca: null, punkt: null, adres: null, odbierzDo,
})

describe('czyPilna', () => {
  it('termin dzis jest pilny', () => {
    expect(czyPilna(new Date(2026, 8, 17, 23, 0), TERAZ)).toBe(true)
  })

  it('termin jutro jest pilny - to ostatni wieczor, zeby zdazyc', () => {
    expect(czyPilna(new Date(2026, 8, 18, 12, 0), TERAZ)).toBe(true)
  })

  it('pojutrze juz nie', () => {
    expect(czyPilna(new Date(2026, 8, 19, 12, 0), TERAZ)).toBe(false)
  })

  it('termin ktory juz minal tez jest pilny - paczka zaraz wroci do nadawcy', () => {
    expect(czyPilna(new Date(2026, 8, 16, 12, 0), TERAZ)).toBe(true)
  })

  it('brak terminu nie jest pilny - nie zmyslamy alarmu', () => {
    expect(czyPilna(null, TERAZ)).toBe(false)
  })
})

describe('posortujPaczki', () => {
  it('najblizszy termin na gorze', () => {
    const lista = [p('b', new Date(2026, 8, 20)), p('a', new Date(2026, 8, 18))]
    expect(posortujPaczki(lista).map((x) => x.numer)).toEqual(['a', 'b'])
  })

  it('paczki bez terminu ida na koniec, nie na poczatek', () => {
    const lista = [p('bez', null), p('z', new Date(2026, 8, 20))]
    expect(posortujPaczki(lista).map((x) => x.numer)).toEqual(['z', 'bez'])
  })
})
```

- [ ] **Krok 2: Uruchom i potwierdź, że nie przechodzą**

Run: `npx vitest run src/paczki.test.ts`
Oczekiwane: FAIL — brak modułu.

- [ ] **Krok 3: Napisz `src/paczki.ts`**

```ts
import type { PaczkaDb } from './lib/supabase'
import { klucz } from './dates'

export type Paczka = {
  id: string
  memberId: string
  numer: string
  status: string
  nadawca: string | null
  punkt: string | null
  adres: string | null
  /** Termin odbioru - sedno tego ekranu. `null`, gdy API go nie podało. */
  odbierzDo: Date | null
}

export function paczkaZBazy(w: PaczkaDb): Paczka {
  return {
    id: w.id,
    memberId: w.member_id,
    numer: w.shipment_number,
    status: w.status,
    nadawca: w.sender_name,
    punkt: w.point_name,
    adres: w.point_address,
    odbierzDo: w.expiry_date ? new Date(w.expiry_date) : null,
  }
}

/**
 * Czy termin nagli: dziś, jutro albo już minął.
 *
 * Minięty też jest pilny - paczka zaraz wróci do nadawcy, więc to najgorszy
 * moment, żeby ją wyciszyć. Brak terminu pilny NIE jest: nie zmyślamy alarmu
 * z braku danych.
 */
export function czyPilna(odbierzDo: Date | null, teraz: Date): boolean {
  if (!odbierzDo) return false
  const jutro = new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() + 1)
  return klucz(odbierzDo) <= klucz(jutro)
}

/** Najbliższy termin na górze; paczki bez terminu na koniec. */
export function posortujPaczki(paczki: Paczka[]): Paczka[] {
  return [...paczki].sort((a, b) => {
    if (!a.odbierzDo) return 1
    if (!b.odbierzDo) return -1
    return a.odbierzDo.getTime() - b.odbierzDo.getTime()
  })
}
```

Dopisz też typ wiersza w `src/lib/supabase.ts`, obok istniejących `*Db`:

```ts
export type PaczkaDb = {
  id: string
  member_id: string
  household_id: string
  shipment_number: string
  status: string
  sender_name: string | null
  point_name: string | null
  point_address: string | null
  expiry_date: string | null
  stored_date: string | null
}
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

Run: `npx vitest run src/paczki.test.ts`
Oczekiwane: PASS, 7 testów.

- [ ] **Krok 5: Dopisz test nawigacji, który ma się nie udać**

W `src/uklad/nawigacja.test.ts`, w bloku `describe('podział nawigacji na telefonie')`:

```ts
  it('„Paczki" chowają się pod „Więcej" - pasek ma komplet pięciu celów', () => {
    expect(EKRANY_WIECEJ).toContain('paczki')
    expect(EKRANY_TELEFON).not.toContain('paczki')
  })
```

Popraw też istniejący test `'siedem ekranów w kolejności zakładek'` — teraz
ekranów jest osiem:

```ts
    expect(EKRANY).toEqual([
      'dashboard', 'kalendarz', 'zakupy', 'tablica',
      'terminy', 'szkola', 'paczki', 'dom',
    ])
```

(i zmień nazwę testu na `'osiem ekranów w kolejności zakładek, dashboard pierwszy'`)

- [ ] **Krok 6: Uruchom — ma nie przejść**

Run: `npx vitest run src/uklad/nawigacja.test.ts`
Oczekiwane: FAIL.

- [ ] **Krok 7: Dopisz ekran w `nawigacja.ts`**

```ts
export type Ekran = 'dashboard' | 'kalendarz' | 'zakupy' | 'tablica' | 'terminy' | 'szkola' | 'paczki' | 'dom'

export const EKRANY: Ekran[] = ['dashboard', 'kalendarz', 'zakupy', 'tablica', 'terminy', 'szkola', 'paczki', 'dom']
```

W `TYTULY` dopisz `paczki: 'Paczki'`, w `SLUGI` — `paczki: 'paczki'`,
w `EKRANY_WIECEJ` — `'paczki'` (przed `'dom'`).
W `etykietaDodania` dopisz `case 'paczki': return null` — ekran jest tylko do
odczytu, jak „Szkoła".

Dopisz też ikonę w `src/uklad/Ikony.tsx` (karton, w stylu Lucide) i podepnij ją
w `WG_EKRANU` pod kluczem `paczki`:

```tsx
function Karton({ className }: Props) {
  return (
    <svg {...WSPOLNE} className={className}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}
```

- [ ] **Krok 8: Uruchom cały zestaw testów**

Run: `npx vitest run && npx tsc -b && npx oxlint`
Oczekiwane: wszystko przechodzi, zero nowych ostrzeżeń.

- [ ] **Krok 9: Commit**

```bash
git add src/paczki.ts src/paczki.test.ts src/lib/supabase.ts src/uklad/nawigacja.ts src/uklad/nawigacja.test.ts src/uklad/Ikony.tsx
git commit -m "Paczki InPost: domena klienta i wpis w nawigacji

czyPilna traktuje miniety termin jako pilny - paczka zaraz wroci do nadawcy,
wiec to najgorszy moment, zeby ja wyciszyc. Brak terminu pilny NIE jest: nie
zmyslamy alarmu z braku danych. Ekran ladnie pod 'Wiecej', czego pilnuje test -
dolny pasek ma limit pieciu celow.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Hak i ekran „Paczki"

**Files:**
- Create: `src/useInpost.ts`, `src/Paczki.tsx`, `src/style/paczki.css`
- Modify: `src/style/index.css` (dopisz `@import './paczki.css';`), `src/App.tsx`

**Interfaces:**
- Consumes: `Paczka`, `paczkaZBazy`, `czyPilna`, `posortujPaczki` z `./paczki`
- Produces: `useInpost(onBlad)` zwracający `{ paczki: Paczka[]; polaczenia: StatusInpost[]; ladowanie: boolean; odswiez: () => Promise<void> }`

- [ ] **Krok 1: Napisz hak `src/useInpost.ts`**

Wzoruj się na `src/useTablica.ts` (najprostszy hak z `useNaZywo`):

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase, type PaczkaDb } from './lib/supabase'
import { useNaZywo } from './useNaZywo'
import { paczkaZBazy, posortujPaczki, type Paczka } from './paczki'
// Typ powstał w Tasku 4 razem ze swoim pierwszym konsumentem.
import type { StatusInpost } from './uklad/ParowanieInpost'

export function useInpost(onBlad: (tekst: string) => void) {
  const [paczki, setPaczki] = useState<Paczka[]>([])
  const [polaczenia, setPolaczenia] = useState<StatusInpost[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  const pobierz = useCallback(async () => {
    const [{ data: wiersze, error }, { data: stan }] = await Promise.all([
      supabase.from('inpost_parcels').select('*'),
      supabase.rpc('status_polaczenia_inpost'),
    ])

    if (error) {
      onBlad(`Nie udało się wczytać paczek: ${error.message}`)
      return
    }

    setPaczki(posortujPaczki(((wiersze ?? []) as PaczkaDb[]).map(paczkaZBazy)))
    setPolaczenia(
      (stan ?? []).map((s: Record<string, string>) => ({
        memberId: s.member_id,
        imie: s.imie,
        phone: s.phone,
        status: s.status as StatusInpost['status'],
        ostatniBlad: s.ostatni_blad ?? null,
      })),
    )
    setLadowanie(false)
  }, [onBlad])

  useEffect(() => {
    void pobierz()
  }, [pobierz])

  useNaZywo('inpost-na-zywo', 'inpost_parcels', pobierz)

  const odswiez = useCallback(async () => {
    const { error } = await supabase.functions.invoke('inpost-sync')
    if (error) onBlad('Nie udało się odświeżyć paczek.')
    else await pobierz()
  }, [onBlad, pobierz])

  return { paczki, polaczenia, ladowanie, odswiez }
}
```

- [ ] **Krok 2: Napisz ekran `src/Paczki.tsx`**

```tsx
import type { DomownikDb } from './lib/supabase'
import { kolor } from './kolory'
import { czyPilna, type Paczka } from './paczki'
import { dlugaDataZDniem } from './dates'
import { Wczytywanie } from './uklad/Wczytywanie'

type Props = {
  paczki: Paczka[]
  ladowanie: boolean
  osobaPoId: Map<string, DomownikDb>
  onOdswiez: () => void
}

/** Ekran „Paczki": co czeka w paczkomacie i do kiedy. */
export function Paczki({ paczki, ladowanie, osobaPoId, onOdswiez }: Props) {
  const teraz = new Date()

  if (ladowanie) return <Wczytywanie wierszy={3} />

  return (
    <div className="paczki">
      <button type="button" className="drobny" onClick={onOdswiez}>
        Odśwież teraz
      </button>

      {paczki.length === 0 ? (
        <p className="pusto">Nic nie czeka na odbiór.</p>
      ) : (
        <ul className="lista-paczek">
          {paczki.map((p) => {
            const osoba = osobaPoId.get(p.memberId)
            const pilna = czyPilna(p.odbierzDo, teraz)
            return (
              <li key={p.id} className={`karta karta-paczki${pilna ? ' pilna' : ''}`}>
                <p className="paczka-nadawca">{p.nadawca ?? 'Nieznany nadawca'}</p>
                <p className="paczka-punkt">
                  {p.punkt ?? '—'}
                  {p.adres && <span className="meta">{p.adres}</span>}
                </p>
                <div className="paczka-stopka">
                  <span className="autor">
                    {osoba && (
                      <span
                        className="kropka"
                        style={{ background: kolor(osoba.color).kropka }}
                        aria-hidden="true"
                      />
                    )}
                    {osoba?.name ?? 'ktoś z domu'}
                  </span>
                  {p.odbierzDo && (
                    <span className={`paczka-termin${pilna ? ' pilny' : ''}`}>
                      odbierz do {dlugaDataZDniem(p.odbierzDo)}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Krok 3: Napisz `src/style/paczki.css`**

```css
.paczki {
  display: flex;
  flex-direction: column;
  gap: var(--odstep-4);
  align-items: flex-start;
}

.lista-paczek {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--odstep-3);
}

.karta-paczki {
  display: flex;
  flex-direction: column;
  gap: var(--odstep-2);
}

/* Pilna paczka bierze to samo tlo co przeterminowany wiersz w Terminach -
   jeden jezyk alarmu w calej aplikacji. */
.karta-paczki.pilna {
  background: var(--blad-tlo);
}

.paczka-nadawca {
  margin: 0;
  font-size: var(--tekst-m);
  font-weight: 600;
}

.paczka-punkt {
  margin: 0;
  font-size: var(--tekst-s);
  color: var(--tekst-drugi);
}

.paczka-stopka {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--odstep-3);
  flex-wrap: wrap;
  margin-top: var(--odstep-1);
}

.paczka-termin {
  font-size: var(--tekst-s);
  color: var(--tekst-drugi);
}

.paczka-termin.pilny {
  color: var(--blad);
  font-weight: 600;
}
```

Dopisz import w `src/style/index.css`, po `./listy.css`:

```css
@import './paczki.css';
```

- [ ] **Krok 4: Podepnij ekran w `App.tsx`**

Dopisz hak obok pozostałych:

```tsx
const inpost = useInpost(setBlad)
```

W drabince `ekran === ...` w `tresc`, przed gałęzią `'dom'`:

```tsx
      ) : ekran === 'paczki' ? (
        <Paczki
          paczki={inpost.paczki}
          ladowanie={inpost.ladowanie}
          osobaPoId={osobaPoId}
          onOdswiez={() => void inpost.odswiez()}
        />
```

- [ ] **Krok 5: Sprawdź w przeglądarce**

Run: `npm run dev`, wejdź na `http://localhost:5173/#/paczki`.
Oczekiwane: ekran się renderuje; przy pustej bazie widać „Nic nie czeka na
odbiór."; na telefonie (ramka 390 px) zakładka jest pod „Więcej", a dolny pasek
nadal ma pięć celów i zero przewijania poziomego.

- [ ] **Krok 6: Commit**

```bash
git add src/useInpost.ts src/Paczki.tsx src/style/paczki.css src/style/index.css src/App.tsx
git commit -m "Paczki InPost: hak i ekran

Pilna paczka bierze to samo tlo co przeterminowany wiersz w Terminach -
jeden jezyk alarmu w calej aplikacji. Kod odbioru nie pojawia sie nigdzie
w interfejsie; po niego odsylamy do aplikacji InPost.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Licznik na „Dziś" i poranny mail

**Files:**
- Modify: `src/dashboardLiczniki.ts`, `src/dashboardLiczniki.test.ts`, `src/Dashboard.tsx`, `supabase/schema.sql`

**Interfaces:**
- Consumes: `Paczka`, `czyPilna` z `./paczki`; `useInpost` z Taska 8
- Produces: `liczPaczkiDoOdbioru(paczki)`, `czyPilnePaczki(paczki, teraz)`

- [ ] **Krok 1: Dopisz testy liczników**

```ts
// w src/dashboardLiczniki.test.ts
import { czyPilnePaczki, liczPaczkiDoOdbioru } from './dashboardLiczniki'
import type { Paczka } from './paczki'

const paczka = (odbierzDo: Date | null): Paczka => ({
  id: 'x', memberId: 'm', numer: 'x', status: 'Gotowa do odbioru',
  nadawca: null, punkt: null, adres: null, odbierzDo,
})

describe('liczniki paczek', () => {
  const TERAZ = new Date(2026, 8, 17, 10, 0)

  it('liczy wszystkie czekajace paczki', () => {
    expect(liczPaczkiDoOdbioru([paczka(null), paczka(new Date(2026, 8, 25))])).toBe(2)
  })

  it('czerwony alarm tylko wtedy, gdy ktorys termin nagli', () => {
    expect(czyPilnePaczki([paczka(new Date(2026, 8, 25))], TERAZ)).toBe(false)
    expect(czyPilnePaczki([paczka(new Date(2026, 8, 18))], TERAZ)).toBe(true)
  })

  it('pusta lista nie alarmuje', () => {
    expect(czyPilnePaczki([], TERAZ)).toBe(false)
  })
})
```

- [ ] **Krok 2: Uruchom — ma nie przejść**

Run: `npx vitest run src/dashboardLiczniki.test.ts`
Oczekiwane: FAIL.

- [ ] **Krok 3: Dopisz funkcje w `src/dashboardLiczniki.ts`**

```ts
import { czyPilna, type Paczka } from './paczki'

/** Ile paczek czeka w paczkomatach całego domu. */
export function liczPaczkiDoOdbioru(paczki: Paczka[]): number {
  return paczki.length
}

/** Czy którakolwiek paczka ma termin dziś, jutro albo już miniony. */
export function czyPilnePaczki(paczki: Paczka[], teraz: Date): boolean {
  return paczki.some((p) => czyPilna(p.odbierzDo, teraz))
}
```

- [ ] **Krok 4: Uruchom — ma przejść**

Run: `npx vitest run src/dashboardLiczniki.test.ts`

- [ ] **Krok 5: Dopisz licznik w `Dashboard.tsx`**

Dodaj do `Props`: `paczki: Paczka[]` i przekaż je z `App.tsx` (`inpost.paczki`).
W siatce liczników, po „Do kupienia":

```tsx
        <LicznikDnia
          etykieta="Paczki do odbioru"
          wartosc={liczPaczkiDoOdbioru(paczki)}
          pilny={czyPilnePaczki(paczki, teraz)}
          onKlik={() => onEkran('paczki')}
        />
```

- [ ] **Krok 6: Dopisz linijkę do porannego maila**

W `supabase/schema.sql`, w funkcji `public.podsumowanie_domu(...)`, dopisz do
zwracanego JSON-a klucz `paczki`:

```sql
  'paczki', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'nadawca',   p.sender_name,
             'punkt',     p.point_name,
             'odbierzDo', p.expiry_date
           ) order by p.expiry_date nulls last), '[]'::jsonb)
    from public.inpost_parcels p
    where p.household_id = p_dom
  ),
```

- [ ] **Krok 7: Dopisz sekcję do treści podsumowania**

W `supabase/functions/_wspolne/podsumowanie.ts` (ten sam plik składa treść dla
maila i dla bota) rozszerz typ i dopisz sekcję:

```ts
export type PaczkaDnia = { nadawca: string | null; punkt: string | null; odbierzDo: string | null }

export type DanePodsumowania = {
  dzien: string // 'RRRR-MM-DD'
  wydarzenia: WydarzenieDnia[]
  notatki: NotatkaDnia[]
  listy: ListaDnia[]
  paczki: PaczkaDnia[]
}

/** 'Allegro - MIL01A, odbierz do 20.09' albo bez terminu, gdy API go nie podało. */
export function liniaPaczki(p: PaczkaDnia): string {
  const kto = p.nadawca ?? 'Przesyłka'
  const gdzie = p.punkt ? ` - ${p.punkt}` : ''
  if (!p.odbierzDo) return `${kto}${gdzie}`
  const d = new Date(p.odbierzDo)
  const dzien = String(d.getDate()).padStart(2, '0')
  const miesiac = String(d.getMonth() + 1).padStart(2, '0')
  return `${kto}${gdzie}, odbierz do ${dzien}.${miesiac}`
}
```

W funkcji `sekcje(...)`, po bloku `if (dane.listy.length)`:

```ts
  if (dane.paczki.length) {
    wynik.push({
      tytul: 'PACZKI DO ODBIORU',
      linie: dane.paczki.map((p) => ({ tresc: liniaPaczki(p), wyroznione: false })),
    })
  }
```

- [ ] **Krok 8: Dopisz testy treści**

W `supabase/functions/_wspolne/podsumowanie.test.ts`:

```ts
import { liniaPaczki, zbudujPodsumowanie } from './podsumowanie'

describe('liniaPaczki', () => {
  it('składa nadawcę, punkt i termin', () => {
    expect(liniaPaczki({ nadawca: 'Allegro', punkt: 'MIL01A', odbierzDo: '2026-09-20T18:00:00Z' }))
      .toBe('Allegro - MIL01A, odbierz do 20.09')
  })

  it('bez terminu nie dopisuje "odbierz do" - nie zmyślamy daty', () => {
    expect(liniaPaczki({ nadawca: 'Allegro', punkt: 'MIL01A', odbierzDo: null }))
      .toBe('Allegro - MIL01A')
  })

  it('nieznany nadawca dostaje neutralne słowo, nie puste miejsce', () => {
    expect(liniaPaczki({ nadawca: null, punkt: null, odbierzDo: null })).toBe('Przesyłka')
  })
})

describe('podsumowanie z paczkami', () => {
  const puste = { dzien: '2026-09-17', wydarzenia: [], notatki: [], listy: [] }
  const odbiorca = { memberId: 'm', imie: 'Marcin', email: 'a@b.pl' }

  it('dzień z samą paczką nie jest dniem "spokojnym"', () => {
    const mail = zbudujPodsumowanie(
      { ...puste, paczki: [{ nadawca: 'Allegro', punkt: 'MIL01A', odbierzDo: null }] },
      odbiorca,
    )
    expect(mail.tekst).toContain('PACZKI DO ODBIORU')
    expect(mail.tekst).toContain('Allegro - MIL01A')
  })

  it('dzień bez paczek nie pokazuje pustej sekcji', () => {
    const mail = zbudujPodsumowanie({ ...puste, paczki: [] }, odbiorca)
    expect(mail.tekst).not.toContain('PACZKI DO ODBIORU')
  })
})
```

Uwaga: dopisanie `paczki` do `DanePodsumowania` **zepsuje istniejące testy**,
które budują obiekt bez tego pola. Uzupełnij je o `paczki: []` — to oczekiwana
konsekwencja zmiany typu, nie regresja.

- [ ] **Krok 9: Pełna weryfikacja**

Run: `npx tsc -b && npx vitest run && npx oxlint && npm run build`
Oczekiwane: wszystko przechodzi, zero nowych ostrzeżeń.

- [ ] **Krok 10: Commit**

```bash
git add src/dashboardLiczniki.ts src/dashboardLiczniki.test.ts src/Dashboard.tsx src/App.tsx supabase/schema.sql supabase/functions/_wspolne/podsumowanie.ts supabase/functions/_wspolne/podsumowanie.test.ts
git commit -m "Paczki InPost: licznik na 'Dzis' i linijka w porannym mailu

Licznik czerwienieje tylko wtedy, gdy ktorys termin naprawde nagli - sama
liczba czekajacych paczek to nie alarm. Tresc maila idzie przez
podsumowanie_domu(), wiec ten sam kawalek obsluzy bota, gdyby kiedys mial o
paczkach mowic.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Weryfikacja końcowa (po wszystkich zadaniach)

- [ ] Żywy test: paczka widoczna w aplikacji zgadza się z aplikacją InPost
      (nadawca, paczkomat, termin).
- [ ] `grep -rn "openCode\|open_code" src/ supabase/` zwraca **wyłącznie**
      komentarze wyjaśniające, dlaczego tego nie zapisujemy — zero kodu.
- [ ] Zalogowany użytkownik nie odczyta `inpost_connections` (sprawdzone
      zapytaniem z konsoli przeglądarki).
- [ ] Na telefonie (390 px): dolny pasek ma pięć celów, „Paczki" są pod
      „Więcej", zero przewijania poziomego.
- [ ] Po odebraniu paczki znika z listy przy najbliższej synchronizacji.
