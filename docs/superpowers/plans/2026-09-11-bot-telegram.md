# Bot na komunikatorze (Telegram) — plan wdrożenia

> **Dla agentów:** WYMAGANY SUB-SKILL: użyj `superpowers:subagent-driven-development`
> (zalecane) albo `superpowers:executing-plans`, żeby wykonać ten plan zadanie po
> zadaniu. Kroki mają checkboxy (`- [ ]`) do odhaczania.

**Cel:** Domownik pisze do bota na Telegramie zwykłym językiem. Bot odpowiada,
co dziś/jutro czeka dom (ten sam kawałek co poranny mail), oraz dodaje
pojedyncze wydarzenia do kalendarza na podstawie opisu w wiadomości, dopiero
po potwierdzeniu.

**Architektura:** Telegram wysyła webhook do Edge Function `telegram-bot`,
która działa kluczem `service_role` (Telegram nie daje sesji Supabase Auth,
więc RLS niczego tu nie chroni — funkcja sama pilnuje, że każda operacja
dotyczy właściwego domu). Rozpoznawanie intencji: Gemini function-calling
(ten sam klient co `import-ai`) z trzema narzędziami. Parowanie konta:
jednorazowy kod z apki, wysyłany do bota jako `/start KOD`.

**Stack:** Supabase (Postgres 17, RLS, Edge Functions/Deno, Gemini API),
React 19 + TypeScript + Vite 8, vitest 5, Telegram Bot API.

**Spec:** [`docs/superpowers/specs/2026-09-11-bot-telegram-design.md`](../specs/2026-09-11-bot-telegram-design.md)

## Ograniczenia globalne

- Nazwy kolumn w bazie po angielsku, nazwy funkcji i polityk po polsku — tak
  jest w całym `supabase/schema.sql`.
- Każda zmiana schematu ląduje w **dwóch** miejscach: jako migracja w projekcie
  Supabase (MCP `apply_migration`) **i** dopisana do `supabase/schema.sql`.
- Nowe funkcje w bazie: `security definer set search_path = public`, a po
  utworzeniu **`revoke execute … from anon, authenticated`** wszędzie tam,
  gdzie funkcja jest tylko dla klucza serwisowego.
- Strefa czasowa: `Europe/Warsaw`, liczona **w bazie**. Kod TypeScript nigdy
  nie przelicza stref (poza prostą arytmetyką dat w `botAI.ts`, patrz Zadanie 2).
- `starts_at` / `ends_at` to `timestamp` bez strefy w formacie
  `'RRRR-MM-DDTGG:MM:SS'`. Koniec jest **wyłączny**.
- Projekt Supabase: ref `fqviwnzinpndyprcovxw`.
- Pliki w `supabase/functions/_wspolne/` nie importują niczego z `src/` ani —
  poza `podsumowanie.ts`/`botAI.ts`, które mają być czystym TS — nie zależą
  od siebie nawzajem bez potrzeby. `botAI.ts` i `podsumowanie.test.ts` testuje
  się zwykłym vitestem (bez Deno, bez sieci).
- Testy uruchamiamy `npm test`; lint `npm run lint`; build `npm run build`.
  Wszystkie muszą przechodzić przed każdym commitem.
- Commity po polsku, bez polskich znaków w treści, stopka
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Sekret `GEMINI_API_KEY` już istnieje w projekcie (używa go `import-ai`) —
  bot go reużywa, nie trzeba zakładać nowego.

---

## Struktura plików

| Plik | Odpowiedzialność |
| --- | --- |
| `supabase/schema.sql` | modyfikacja — kolumna, dwie tabele, cztery funkcje (sekcja 18) |
| `supabase/functions/_wspolne/podsumowanie.ts` | modyfikacja — opcja pominięcia stopki mailowej |
| `supabase/functions/_wspolne/podsumowanie.test.ts` | modyfikacja — testy tej opcji |
| `supabase/functions/_wspolne/gemini.ts` | modyfikacja — ogólne wywołanie z wieloma narzędziami |
| `supabase/functions/_wspolne/botAI.ts` | nowy — zapytanie do Gemini (3 narzędzia), walidacja, pomocnicze funkcje dat |
| `supabase/functions/_wspolne/botAI.test.ts` | nowy — testy powyższego |
| `supabase/functions/_wspolne/telegram.ts` | nowy — wysyłka wiadomości przez Telegram Bot API |
| `supabase/functions/telegram-bot/index.ts` | nowy — webhook: parowanie, pytania, propozycje, potwierdzenia |
| `src/lib/supabase.ts` | modyfikacja — pole `telegram_chat_id` w `DomownikDb` |
| `src/useDomownicy.ts` | modyfikacja — `polaczTelegram()` |
| `src/MojDom.tsx` | modyfikacja — sekcja „Bot na Telegramie” |
| `src/style/wspolne.css` | modyfikacja — style sekcji |
| `.env.example` | modyfikacja — `VITE_TELEGRAM_BOT_USERNAME` |
| `README.md` | modyfikacja — opis funkcji, konfiguracja bota, struktura |

---

### Zadanie 1: Parowanie konta w bazie

**Pliki:**
- Modyfikacja: `supabase/schema.sql` (dopisanie sekcji 18, część 1)
- Migracja: `bot_telegram_parowanie`

**Interfejsy:**
- Produkuje: kolumna `members.telegram_chat_id bigint` (unikalna, gdy nie
  `null`), tabela `telegram_kody(kod, member_id, wygasa)`,
  `wygeneruj_kod_telegramu() returns text`,
  `polacz_telegram(p_kod text, p_chat_id bigint) returns boolean`.

- [ ] **Krok 1: Sprawdź, że kolumny i tabeli jeszcze nie ma**

MCP `execute_sql`:

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'members'
   and column_name = 'telegram_chat_id';
select to_regclass('public.telegram_kody');
```

Oczekiwane: pusty wynik z pierwszego zapytania, `null` z drugiego.

- [ ] **Krok 2: Zastosuj migrację**

MCP `apply_migration`, nazwa `bot_telegram_parowanie`:

```sql
alter table public.members
  add column if not exists telegram_chat_id bigint;

create unique index if not exists members_telegram_chat_id_key
  on public.members (telegram_chat_id) where telegram_chat_id is not null;

-- Kody parowania - jednorazowe, krotkotrwale. RLS wlaczone, zero polityk:
-- to sprawa service_role i security definer funkcji, nie przegladarki.
create table if not exists public.telegram_kody (
  kod        text primary key,
  member_id  uuid not null references public.members(id) on delete cascade,
  wygasa     timestamptz not null
);

create index if not exists telegram_kody_member_idx on public.telegram_kody (member_id);

alter table public.telegram_kody enable row level security;

-- Generuje jednorazowy kod parowania dla zalogowanego. Nadpisuje wczesniejszy
-- kod tej samej osoby (jeden aktywny kod na raz), zeby stare kody nie zalegaly.
create or replace function public.wygeneruj_kod_telegramu()
  returns text
  language plpgsql volatile security definer set search_path = public
as $$
declare
  wlasny_member uuid;
  nowy_kod text;
begin
  if auth.uid() is null then
    raise exception 'Trzeba byc zalogowanym.';
  end if;

  select id into wlasny_member from public.members where user_id = auth.uid();
  if wlasny_member is null then
    raise exception 'Nie znaleziono domownika dla tego konta.';
  end if;

  delete from public.telegram_kody where member_id = wlasny_member;

  -- 6 znakow z alfabetu bez znakow latwych do pomylenia (0/O, 1/I/l).
  nowy_kod := (
    select string_agg(znak, '')
      from (
        select substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ',
                       (random() * 31)::int + 1, 1) as znak
          from generate_series(1, 6)
      ) losowe
  );

  insert into public.telegram_kody (kod, member_id, wygasa)
  values (nowy_kod, wlasny_member, now() + interval '15 minutes');

  return nowy_kod;
end
$$;

revoke execute on function public.wygeneruj_kod_telegramu() from public, anon;
grant  execute on function public.wygeneruj_kod_telegramu() to authenticated;

-- Parowanie po stronie bota - wolane kluczem service_role, bez auth.uid().
-- Jedno zapytanie: znajdz niewygasly kod, zaktualizuj chat_id, skasuj kod.
create or replace function public.polacz_telegram(p_kod text, p_chat_id bigint)
  returns boolean
  language plpgsql volatile security definer set search_path = public
as $$
declare
  znaleziony_member uuid;
begin
  select member_id into znaleziony_member
    from public.telegram_kody
   where kod = p_kod and wygasa > now();

  if znaleziony_member is null then
    return false;
  end if;

  update public.members set telegram_chat_id = p_chat_id
   where id = znaleziony_member;

  delete from public.telegram_kody where kod = p_kod;

  return true;
end
$$;

revoke execute on function public.polacz_telegram(text, bigint) from public, anon, authenticated;
```

- [ ] **Krok 3: Wygeneruj kod jako zwykły domownik**

Podstaw pod `<UID>` wynik `select user_id from public.members where user_id is not null limit 1;`

MCP `execute_sql`:

```sql
begin;
select set_config('request.jwt.claims',
                  json_build_object('sub', '<UID>', 'role', 'authenticated')::text, true);
set local role authenticated;

select public.wygeneruj_kod_telegramu();
rollback;
```

Oczekiwane: 6-znakowy kod (litery/cyfry, bez `0/O/1/I/L`).

- [ ] **Krok 4: Sprawdź, że anon nie może wygenerować kodu**

MCP `execute_sql`:

```sql
begin;
set local role anon;
select public.wygeneruj_kod_telegramu();
rollback;
```

Oczekiwane: błąd `permission denied for function wygeneruj_kod_telegramu`.

- [ ] **Krok 5: Sprawdź parowanie i wygasanie kodu**

Podstaw `<MID>` = `id` domownika z kroku 3.

MCP `execute_sql`:

```sql
begin;
insert into public.telegram_kody (kod, member_id, wygasa)
values ('TEST01', '<MID>', now() + interval '5 minutes');

select public.polacz_telegram('TEST01', 999111222);  -- oczekiwane: true
select telegram_chat_id from public.members where id = '<MID>';  -- oczekiwane: 999111222
select count(*) from public.telegram_kody where kod = 'TEST01';  -- oczekiwane: 0 (kod skasowany)

insert into public.telegram_kody (kod, member_id, wygasa)
values ('TEST02', '<MID>', now() - interval '1 minute');  -- juz wygasly

select public.polacz_telegram('TEST02', 999333444);  -- oczekiwane: false
rollback;
```

- [ ] **Krok 6: Sprawdź, że dwaj domownicy nie mogą dzielić chat_id**

MCP `execute_sql` (podstaw `<MID2>` = `id` innego domownika z kontem):

```sql
begin;
update public.members set telegram_chat_id = 555666777 where id = '<MID>';
update public.members set telegram_chat_id = 555666777 where id = '<MID2>';  -- oczekiwane: blad unique
rollback;
```

Oczekiwane: błąd naruszenia `members_telegram_chat_id_key`.

- [ ] **Krok 7: Sprawdź, że przeglądarka nie dosięgnie `polacz_telegram`**

MCP `execute_sql`:

```sql
begin;
set local role authenticated;
select public.polacz_telegram('cokolwiek', 1);
rollback;
```

Oczekiwane: `permission denied for function polacz_telegram`.

- [ ] **Krok 8: Dopisz sekcję 18 (część 1) do `supabase/schema.sql` i zacommituj**

Na końcu pliku, po sekcji 17:

```sql
-- ============================================================
--  18. Bot na Telegramie
-- ============================================================
```

...i dokładnie ten sam SQL co w Kroku 2.

```bash
git add supabase/schema.sql
git commit -m "Parowanie konta z botem na Telegramie"
```

---

### Zadanie 2: Silnik bota — zapytanie do Gemini i walidacja

**Pliki:**
- Modyfikacja: `supabase/functions/_wspolne/gemini.ts`
- Utworzenie: `supabase/functions/_wspolne/botAI.ts`
- Test: `supabase/functions/_wspolne/botAI.test.ts`

**Interfejsy:**
- Produkuje: `ZakresPodsumowania`, `ProponowaneWydarzenie`, `OdpowiedzBota`,
  `Potwierdzenie`, `WSPOLNE`, `budujZapytanieBota(dzisiaj, domownicy, wiadomosc)`,
  `rozpoznajOdpowiedz(wywolanie, domownicy)`, `rozpoznajPotwierdzenie(wiadomosc)`,
  `dataDlaZakresu(zakres, dzisiaj)`, `nastepnyDzien(data)`,
  `zlozTimestamp(data, godzina)`, `opisPropozycji(w)`.
- Produkuje (w `gemini.ts`): `zapytajGeminiNarzedzie(zapytanie, kluczApi)`
  zwracające `{ nazwa: string; args: Record<string, unknown> }` — **nie
  zmienia** istniejącej `zapytajGemini` (używanej przez `import-ai`), to
  osobna, dodatkowa funkcja dla wielu narzędzi naraz.

`gemini.ts` nie ma dziś własnych testów (Deno + sieć, jak `resend.ts`) i tu
też ich nie dodajemy — poprawność tej funkcji zweryfikuje `botAI.ts` w Kroku 6
(importuje z niej typ) i żywy test w Zadaniu 8.

- [ ] **Krok 1: Dopisz `zapytajGeminiNarzedzie` na końcu `gemini.ts`**

```ts
export type WywolanieNarzedzia = { nazwa: string; args: Record<string, unknown> }

/**
 * Ogólne wywołanie Gemini z wieloma możliwymi narzędziami naraz - w
 * odróżnieniu od `zapytajGemini` (jedno narzędzie, import-ai), tu model sam
 * wybiera, którego użyć, więc zwracamy nazwę i argumenty, a nie z góry
 * ustalony kształt.
 */
export async function zapytajGeminiNarzedzie(
  zapytanie: Record<string, unknown> & { model: string },
  kluczApi: string,
): Promise<WywolanieNarzedzia> {
  const odpowiedz = await fetch(`${GEMINI_URL}/${zapytanie.model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': kluczApi,
    },
    body: JSON.stringify(zapytanie),
  })

  if (!odpowiedz.ok) {
    const tekst = await odpowiedz.text()
    throw new Error(`Gemini API zwróciło ${odpowiedz.status}: ${tekst}`)
  }

  const dane = await odpowiedz.json()
  const kandydat = dane.candidates?.[0]

  if (kandydat?.finishReason === 'MAX_TOKENS') {
    throw new Error('Odpowiedź została ucięta.')
  }
  if (kandydat?.finishReason === 'SAFETY') {
    throw new Error('Gemini odmówił odpowiedzi.')
  }

  const blokNarzedzia = (kandydat?.content?.parts ?? []).find(
    (blok: { functionCall?: unknown }) => blok.functionCall,
  )

  if (!blokNarzedzia) {
    throw new Error('Odpowiedź Gemini nie zawiera wywołania narzędzia.')
  }

  const wywolanie = blokNarzedzia.functionCall as { name: string; args: Record<string, unknown> }
  return { nazwa: wywolanie.name, args: wywolanie.args }
}
```

`GEMINI_URL` już istnieje w tym pliku (na górze) — użyj go, nie dopisuj
drugi raz.

- [ ] **Krok 2: `npm run build` — musi przejść**

```bash
npm run build
```

Oczekiwane: PASS (ten plik nie jest jeszcze przez nikogo importowany, więc
build i tak przejdzie — to tylko sanity-check składni).

- [ ] **Krok 3: Commit**

```bash
git add supabase/functions/_wspolne/gemini.ts
git commit -m "Ogolne wywolanie Gemini z wieloma narzedziami"
```

- [ ] **Krok 4: Testy narzędzi i rozpoznawania — napisz je najpierw**

Utwórz `supabase/functions/_wspolne/botAI.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  WSPOLNE,
  budujZapytanieBota,
  dataDlaZakresu,
  nastepnyDzien,
  opisPropozycji,
  rozpoznajOdpowiedz,
  rozpoznajPotwierdzenie,
  zlozTimestamp,
} from './botAI'

describe('budujZapytanieBota', () => {
  it('zawiera wiadomosc uzytkownika i liste domownikow w instrukcji systemowej', () => {
    const z = budujZapytanieBota(new Date('2026-09-11T10:00:00'), ['Marcin', 'Magda'], 'co mam jutro?')
    expect(z.contents[0].parts[0].text).toBe('co mam jutro?')
    expect(z.systemInstruction.parts[0].text).toContain('Marcin, Magda')
  })

  it('wymusza wybor jednego z trzech narzedzi', () => {
    const z = budujZapytanieBota(new Date('2026-09-11T10:00:00'), [], 'test')
    const nazwy = z.tools[0].functionDeclarations.map((n: { name: string }) => n.name)
    expect(nazwy).toEqual(['pokaz_podsumowanie', 'zaproponuj_wydarzenie', 'odpowiedz_tekstem'])
    expect(z.toolConfig.functionCallingConfig.mode).toBe('ANY')
  })
})

describe('rozpoznajOdpowiedz - pokaz_podsumowanie', () => {
  it('poprawny zakres', () => {
    const w = rozpoznajOdpowiedz({ nazwa: 'pokaz_podsumowanie', args: { zakres: 'jutro' } }, [])
    expect(w).toEqual({ rodzaj: 'podsumowanie', zakres: 'jutro' })
  })

  it('odrzuca nieznany zakres', () => {
    expect(() =>
      rozpoznajOdpowiedz({ nazwa: 'pokaz_podsumowanie', args: { zakres: 'pojutrze' } }, []),
    ).toThrow('zakres')
  })
})

describe('rozpoznajOdpowiedz - zaproponuj_wydarzenie', () => {
  const argumenty = {
    tytul: 'Dentysta',
    czlonek: 'Marcin',
    data: '2026-09-18',
    start: '15:00',
    koniec: '16:00',
    calodniowe: false,
  }

  it('domownik z listy', () => {
    const w = rozpoznajOdpowiedz({ nazwa: 'zaproponuj_wydarzenie', args: argumenty }, ['Marcin', 'Magda'])
    expect(w).toEqual({ rodzaj: 'wydarzenie', wydarzenie: argumenty })
  })

  it('akceptuje Wspólne jako czlonka', () => {
    const w = rozpoznajOdpowiedz(
      { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, czlonek: WSPOLNE } },
      ['Marcin'],
    )
    expect(w.rodzaj).toBe('wydarzenie')
  })

  it('odrzuca osobe spoza listy domownikow', () => {
    expect(() =>
      rozpoznajOdpowiedz(
        { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, czlonek: 'Ktoś Obcy' } },
        ['Marcin'],
      ),
    ).toThrow('nieznaną osobę')
  })

  it('odrzuca nieprawidlowa date', () => {
    expect(() =>
      rozpoznajOdpowiedz(
        { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, data: 'nie-data' } },
        ['Marcin'],
      ),
    ).toThrow('Nieprawidłowa data')
  })

  it('odrzuca brak tytulu', () => {
    expect(() =>
      rozpoznajOdpowiedz(
        { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, tytul: '   ' } },
        ['Marcin'],
      ),
    ).toThrow('tytułu')
  })

  it('odrzuca koniec nie pozniejszy niz poczatek', () => {
    expect(() =>
      rozpoznajOdpowiedz(
        { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, start: '11:00', koniec: '10:00' } },
        ['Marcin'],
      ),
    ).toThrow('późniejszy')
  })

  it('calodniowe pomija sprawdzenie kolejnosci godzin', () => {
    const w = rozpoznajOdpowiedz(
      { nazwa: 'zaproponuj_wydarzenie', args: { ...argumenty, calodniowe: true, start: '00:00', koniec: '00:00' } },
      ['Marcin'],
    )
    expect(w.rodzaj).toBe('wydarzenie')
  })
})

describe('rozpoznajOdpowiedz - odpowiedz_tekstem i bledy', () => {
  it('zwraca tresc', () => {
    const w = rozpoznajOdpowiedz({ nazwa: 'odpowiedz_tekstem', args: { tresc: 'Cześć!' } }, [])
    expect(w).toEqual({ rodzaj: 'tekst', tresc: 'Cześć!' })
  })

  it('pusta tresc dostaje domyslny tekst', () => {
    const w = rozpoznajOdpowiedz({ nazwa: 'odpowiedz_tekstem', args: { tresc: '' } }, [])
    expect(w).toEqual({ rodzaj: 'tekst', tresc: 'Nie jestem pewien, o co pytasz.' })
  })

  it('nieznane narzedzie rzuca blad', () => {
    expect(() => rozpoznajOdpowiedz({ nazwa: 'cos_innego', args: {} }, [])).toThrow('Nieznane narzędzie')
  })
})

describe('rozpoznajPotwierdzenie', () => {
  it('rozpoznaje "tak" niezaleznie od wielkosci liter i spacji', () => {
    expect(rozpoznajPotwierdzenie('Tak')).toBe('tak')
    expect(rozpoznajPotwierdzenie('  tak  ')).toBe('tak')
    expect(rozpoznajPotwierdzenie('OK')).toBe('tak')
  })

  it('rozpoznaje "nie"', () => {
    expect(rozpoznajPotwierdzenie('nie')).toBe('nie')
    expect(rozpoznajPotwierdzenie('anuluj')).toBe('nie')
  })

  it('cokolwiek innego jest niejasne', () => {
    expect(rozpoznajPotwierdzenie('a moze pojutrze')).toBe('niejasne')
  })
})

describe('dataDlaZakresu', () => {
  it('dzis to dzisiejsza data', () => {
    expect(dataDlaZakresu('dzis', new Date('2026-09-11T10:00:00'))).toBe('2026-09-11')
  })

  it('jutro to nastepny dzien', () => {
    expect(dataDlaZakresu('jutro', new Date('2026-09-11T10:00:00'))).toBe('2026-09-12')
  })
})

describe('nastepnyDzien', () => {
  it('dodaje jeden dzien', () => {
    expect(nastepnyDzien('2026-09-30')).toBe('2026-10-01')
  })
})

describe('zlozTimestamp', () => {
  it('laczy date i godzine w format bazy', () => {
    expect(zlozTimestamp('2026-09-18', '15:00')).toBe('2026-09-18T15:00:00')
  })
})

describe('opisPropozycji', () => {
  it('wydarzenie godzinowe z osoba', () => {
    expect(
      opisPropozycji({ tytul: 'Dentysta', czlonek: 'Marcin', data: '2026-09-18', start: '15:00', koniec: '16:00', calodniowe: false }),
    ).toBe('Dentysta (Marcin) — 2026-09-18, 15:00–16:00')
  })

  it('wydarzenie calodniowe, wspolne (bez osoby w nawiasie)', () => {
    expect(
      opisPropozycji({ tytul: 'Wycieczka', czlonek: WSPOLNE, data: '2026-09-20', start: '00:00', koniec: '23:59', calodniowe: true }),
    ).toBe('Wycieczka — 2026-09-20 (cały dzień)')
  })
})
```

- [ ] **Krok 5: Uruchom testy i upewnij się, że padają**

```bash
npm test -- botAI
```

Oczekiwane: FAIL, `Failed to resolve import "./botAI"`.

- [ ] **Krok 6: Napisz `botAI.ts`**

Utwórz `supabase/functions/_wspolne/botAI.ts`:

```ts
/**
 * Silnik bota: budowa zapytania do Gemini (trzy narzędzia), walidacja jego
 * odpowiedzi, rozpoznawanie "tak"/"nie" i drobna arytmetyka dat. Czyste
 * funkcje - bez importu Deno ani klienta Supabase, żeby dało się je
 * testować zwykłym vitestem, tak jak `importAI.ts`.
 */

import type { WywolanieNarzedzia } from './gemini.ts'

export const WSPOLNE = 'Wspólne'

export type ZakresPodsumowania = 'dzis' | 'jutro'

export type ProponowaneWydarzenie = {
  tytul: string
  czlonek: string // dokladnie jedno z podanych imion domownikow albo WSPOLNE
  data: string     // 'RRRR-MM-DD'
  start: string    // 'GG:MM' - ignorowane, gdy calodniowe === true
  koniec: string   // 'GG:MM' - ignorowane, gdy calodniowe === true
  calodniowe: boolean
}

export type OdpowiedzBota =
  | { rodzaj: 'podsumowanie'; zakres: ZakresPodsumowania }
  | { rodzaj: 'wydarzenie'; wydarzenie: ProponowaneWydarzenie }
  | { rodzaj: 'tekst'; tresc: string }

export type Potwierdzenie = 'tak' | 'nie' | 'niejasne'

const MODEL = 'gemini-3.6-flash'

const NARZEDZIE_PODSUMOWANIE = 'pokaz_podsumowanie'
const NARZEDZIE_WYDARZENIE = 'zaproponuj_wydarzenie'
const NARZEDZIE_TEKST = 'odpowiedz_tekstem'

function danaDzien(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function schematNarzedzi(domownicy: string[]) {
  return [
    {
      name: NARZEDZIE_PODSUMOWANIE,
      description: 'Uzytkownik pyta, co go czeka w domu - kalendarz, tablica, zakupy, dzis albo jutro.',
      parameters: {
        type: 'object',
        properties: {
          zakres: { type: 'string', enum: ['dzis', 'jutro'] },
        },
        required: ['zakres'],
      },
    },
    {
      name: NARZEDZIE_WYDARZENIE,
      description: 'Uzytkownik prosi o dodanie pojedynczego wydarzenia do kalendarza.',
      parameters: {
        type: 'object',
        properties: {
          tytul: { type: 'string' },
          czlonek: { type: 'string', enum: [...domownicy, WSPOLNE] },
          data: { type: 'string', description: 'RRRR-MM-DD' },
          start: { type: 'string', description: 'GG:MM, dowolne przy calodniowe=true' },
          koniec: { type: 'string', description: 'GG:MM, dowolne przy calodniowe=true' },
          calodniowe: { type: 'boolean' },
        },
        required: ['tytul', 'czlonek', 'data', 'start', 'koniec', 'calodniowe'],
      },
    },
    {
      name: NARZEDZIE_TEKST,
      description: 'Wiadomosc nie pasuje do zadnej z powyzszych akcji - odpowiedz krotko, po ludzku.',
      parameters: {
        type: 'object',
        properties: {
          tresc: { type: 'string' },
        },
        required: ['tresc'],
      },
    },
  ]
}

/** Zapytanie do Gemini generateContent z trzema narzedziami do wyboru. */
export function budujZapytanieBota(dzisiaj: Date, domownicy: string[], wiadomosc: string) {
  return {
    model: MODEL,
    systemInstruction: {
      parts: [
        {
          text:
            `Jesteś botem rodzinnego kalendarza Kokpit. Dzisiaj jest ${danaDzien(dzisiaj)}. ` +
            `Domownicy w tym domu: ${domownicy.length > 0 ? domownicy.join(', ') : '(brak)'}. ` +
            'Użyj narzędzia pasującego do wiadomości: pokaz_podsumowanie gdy pytają o kalendarz/tablicę/zakupy, ' +
            'zaproponuj_wydarzenie gdy proszą o dodanie czegoś do kalendarza (pole "czlonek" musi być dokładnie ' +
            'jednym z podanych imion domowników albo "Wspólne"), odpowiedz_tekstem w każdym innym przypadku - ' +
            'krótko i po ludzku wytłumacz, że potrafisz pokazać kalendarz albo dodać wydarzenie.',
        },
      ],
    },
    contents: [{ role: 'user', parts: [{ text: wiadomosc }] }],
    tools: [{ functionDeclarations: schematNarzedzi(domownicy) }],
    toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    generationConfig: { maxOutputTokens: 2000, thinkingConfig: { thinkingLevel: 'minimal' } },
  }
}

/**
 * Waliduje wywolanie narzedzia od Gemini - to dane z granicy zaufania,
 * sprawdzamy je tak samo jak dane od uzytkownika. Rzuca czytelny blad
 * zamiast zwracac null, bo kazdy blad tutaj i tak konczy sie tym samym
 * komunikatem "cos poszlo nie tak" w index.ts.
 */
export function rozpoznajOdpowiedz(
  wywolanie: WywolanieNarzedzia,
  domownicy: string[],
): OdpowiedzBota {
  const a = wywolanie.args

  if (wywolanie.nazwa === NARZEDZIE_PODSUMOWANIE) {
    const zakres = a.zakres
    if (zakres !== 'dzis' && zakres !== 'jutro') {
      throw new Error(`Nieprawidłowy zakres podsumowania: "${String(zakres)}".`)
    }
    return { rodzaj: 'podsumowanie', zakres }
  }

  if (wywolanie.nazwa === NARZEDZIE_WYDARZENIE) {
    const dozwoleni = new Set([...domownicy, WSPOLNE])
    if (typeof a.czlonek !== 'string' || !dozwoleni.has(a.czlonek)) {
      throw new Error(`Rozpoznano nieznaną osobę: "${String(a.czlonek)}".`)
    }
    if (typeof a.data !== 'string' || Number.isNaN(new Date(a.data).getTime())) {
      throw new Error(`Nieprawidłowa data: "${String(a.data)}".`)
    }
    if (typeof a.tytul !== 'string' || !a.tytul.trim()) {
      throw new Error('Brak tytułu wydarzenia.')
    }
    const calodniowe = Boolean(a.calodniowe)
    const start = typeof a.start === 'string' ? a.start : '00:00'
    const koniec = typeof a.koniec === 'string' ? a.koniec : '23:59'
    if (!calodniowe && koniec <= start) {
      throw new Error('Koniec wydarzenia nie jest późniejszy niż początek.')
    }
    return {
      rodzaj: 'wydarzenie',
      wydarzenie: { tytul: a.tytul, czlonek: a.czlonek, data: a.data, start, koniec, calodniowe },
    }
  }

  if (wywolanie.nazwa === NARZEDZIE_TEKST) {
    const tresc = a.tresc
    return {
      rodzaj: 'tekst',
      tresc: typeof tresc === 'string' && tresc.trim() ? tresc : 'Nie jestem pewien, o co pytasz.',
    }
  }

  throw new Error(`Nieznane narzędzie: "${wywolanie.nazwa}".`)
}

const SLOWA_TAK = new Set(['tak', 'ok', 'okej', 'jasne', 'pewnie', 'zapisz', 'dodaj'])
const SLOWA_NIE = new Set(['nie', 'anuluj', 'odrzuc', 'niewazne'])

/** Rozpoznaje odpowiedz na pytanie "zapisac?" - bez wolania Gemini. */
export function rozpoznajPotwierdzenie(wiadomosc: string): Potwierdzenie {
  const znormalizowana = wiadomosc.trim().toLowerCase()
  if (SLOWA_TAK.has(znormalizowana)) return 'tak'
  if (SLOWA_NIE.has(znormalizowana)) return 'nie'
  return 'niejasne'
}

/** Data (RRRR-MM-DD) dla "dzis"/"jutro" wzgledem podanej chwili. */
export function dataDlaZakresu(zakres: ZakresPodsumowania, dzisiaj: Date): string {
  const d = new Date(dzisiaj)
  if (zakres === 'jutro') d.setDate(d.getDate() + 1)
  return danaDzien(d)
}

/** Dzien po danej dacie (RRRR-MM-DD) - potrzebne do konca wydarzenia calodniowego. */
export function nastepnyDzien(data: string): string {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Sklada "RRRR-MM-DDTGG:MM:SS" z osobnych pol - tak zapisuje je baza. */
export function zlozTimestamp(data: string, godzina: string): string {
  return `${data}T${godzina}:00`
}

/** Tekst pytania "zapisac: ...?" pokazywany domownikowi przed zapisem. */
export function opisPropozycji(w: ProponowaneWydarzenie): string {
  const kiedy = w.calodniowe ? `${w.data} (cały dzień)` : `${w.data}, ${w.start}–${w.koniec}`
  const dla = w.czlonek === WSPOLNE ? '' : ` (${w.czlonek})`
  return `${w.tytul}${dla} — ${kiedy}`
}
```

- [ ] **Krok 7: Uruchom testy — mają przejść**

```bash
npm test -- botAI
```

Oczekiwane: PASS, 23 testy.

- [ ] **Krok 8: Pełne testy, lint i build**

```bash
npm test
npm run lint
npm run build
```

Oczekiwane: wszystkie testy PASS (131 dotychczasowe + 23 nowe = 154), lint i
build bez uwag.

- [ ] **Krok 9: Commit**

```bash
git add supabase/functions/_wspolne/botAI.ts supabase/functions/_wspolne/botAI.test.ts
git commit -m "Silnik bota - zapytanie do Gemini i walidacja odpowiedzi"
```

---

### Zadanie 3: Podsumowanie bez mailowej stopki

**Pliki:**
- Modyfikacja: `supabase/functions/_wspolne/podsumowanie.ts`
- Modyfikacja: `supabase/functions/_wspolne/podsumowanie.test.ts`

**Interfejsy:**
- Konsumuje: istniejące `zbudujPodsumowanie` (zmienia tylko trzeci argument).
- Produkuje: `zbudujPodsumowanie(dane, odbiorca, { linkAplikacji?, pokazStopke?
  })` — `pokazStopke` domyślnie `true` (zgodność wsteczna z mailem, który tego
  argumentu nie przekazuje).

- [ ] **Krok 1: Testy — dopisz do istniejącego pliku testów**

Na końcu `supabase/functions/_wspolne/podsumowanie.test.ts` dopisz:

```ts
describe('zbudujPodsumowanie - pokazStopke', () => {
  it('domyslnie pokazuje stopke (zgodnosc wsteczna z mailem)', () => {
    const { tekst } = zbudujPodsumowanie(PUSTE, ODBIORCA)
    expect(tekst).toContain('Wyłączysz to w Kokpicie')
  })

  it('pokazStopke:false chowa zdanie o wylaczeniu, ale nie reszte tekstu', () => {
    const { tekst } = zbudujPodsumowanie(PUSTE, ODBIORCA, { pokazStopke: false })
    expect(tekst).not.toContain('Wyłączysz to w Kokpicie')
    expect(tekst).toContain('Dzień dobry, Ola!')
  })

  it('link dziala tez bez stopki', () => {
    const { tekst, html } = zbudujPodsumowanie(PUSTE, ODBIORCA, {
      pokazStopke: false,
      linkAplikacji: 'https://kokpit.example',
    })
    expect(tekst).toContain('https://kokpit.example')
    expect(html).toContain('https://kokpit.example')
    expect(html).not.toContain('Wyłączysz to w Kokpicie')
  })
})
```

`PUSTE`, `ODBIORCA` i `zbudujPodsumowanie` już są zaimportowane/zdefiniowane
w tym pliku — nic więcej nie trzeba dopisywać do importów.

- [ ] **Krok 2: Uruchom testy i upewnij się, że padają**

```bash
npm test -- podsumowanie
```

Oczekiwane: FAIL na drugim i trzecim nowym teście (stopka nadal się pokazuje,
bo kod jeszcze nie zna `pokazStopke`).

- [ ] **Krok 3: Zmodyfikuj `zbudujPodsumowanie` w `podsumowanie.ts`**

Zmień sygnaturę i dwa miejsca budowania stopki. Było:

```ts
export function zbudujPodsumowanie(
  dane: DanePodsumowania,
  odbiorca: Odbiorca,
  opcje: { linkAplikacji?: string } = {},
): Mail {
  const czesci = sekcje(dane, odbiorca.memberId)
  const powitanie = `Dzień dobry, ${odbiorca.imie}!`
  const link = opcje.linkAplikacji?.trim()

  const tekst = [
    powitanie,
    '',
    ...(czesci.length
      ? czesci.flatMap((s) => [
          s.tytul,
          ...s.linie.map((l) => `${l.wyroznione ? '* ' : '  '}${l.tresc}`),
          '',
        ])
      : [SPOKOJNY, '']),
    STOPKA,
    ...(link ? [link] : []),
  ].join('\n')

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;',
    'font-size:15px;line-height:1.5;color:#1f2937;max-width:520px">',
    `<p style="margin:0 0 16px">${escapuj(powitanie)}</p>`,
    ...(czesci.length
      ? czesci.map(
          (s) =>
            `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:#6b7280">${escapuj(s.tytul)}</p>` +
            `<ul style="margin:0 0 18px;padding-left:18px">` +
            s.linie
              .map(
                (l) =>
                  `<li style="margin:0 0 4px${l.wyroznione ? ';font-weight:600' : ''}">${escapuj(l.tresc)}</li>`,
              )
              .join('') +
            '</ul>',
        )
      : [`<p style="margin:0 0 18px">${escapuj(SPOKOJNY)}</p>`]),
    `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af">${escapuj(STOPKA)}`,
    link
      ? ` <a href="${escapuj(link)}" style="color:#7c3aed">Otwórz Kokpit</a>`
      : '',
    '</p></div>',
  ].join('')

  return { temat: temat(dane), tekst, html }
}
```

Ma być:

```ts
export function zbudujPodsumowanie(
  dane: DanePodsumowania,
  odbiorca: Odbiorca,
  opcje: { linkAplikacji?: string; pokazStopke?: boolean } = {},
): Mail {
  const czesci = sekcje(dane, odbiorca.memberId)
  const powitanie = `Dzień dobry, ${odbiorca.imie}!`
  const link = opcje.linkAplikacji?.trim()
  const stopka = opcje.pokazStopke ?? true

  const tekst = [
    powitanie,
    '',
    ...(czesci.length
      ? czesci.flatMap((s) => [
          s.tytul,
          ...s.linie.map((l) => `${l.wyroznione ? '* ' : '  '}${l.tresc}`),
          '',
        ])
      : [SPOKOJNY, '']),
    ...(stopka ? [STOPKA] : []),
    ...(link ? [link] : []),
  ].join('\n')

  const stopkaHtml = stopka
    ? `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af">${escapuj(STOPKA)}${
        link ? ` <a href="${escapuj(link)}" style="color:#7c3aed">Otwórz Kokpit</a>` : ''
      }</p>`
    : link
      ? `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af"><a href="${escapuj(link)}" style="color:#7c3aed">Otwórz Kokpit</a></p>`
      : ''

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;',
    'font-size:15px;line-height:1.5;color:#1f2937;max-width:520px">',
    `<p style="margin:0 0 16px">${escapuj(powitanie)}</p>`,
    ...(czesci.length
      ? czesci.map(
          (s) =>
            `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:#6b7280">${escapuj(s.tytul)}</p>` +
            `<ul style="margin:0 0 18px;padding-left:18px">` +
            s.linie
              .map(
                (l) =>
                  `<li style="margin:0 0 4px${l.wyroznione ? ';font-weight:600' : ''}">${escapuj(l.tresc)}</li>`,
              )
              .join('') +
            '</ul>',
        )
      : [`<p style="margin:0 0 18px">${escapuj(SPOKOJNY)}</p>`]),
    stopkaHtml,
    '</div>',
  ].join('')

  return { temat: temat(dane), tekst, html }
}
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm test -- podsumowanie
```

Oczekiwane: PASS, 27 testów w tym pliku (24 dotychczasowe + 3 nowe).

- [ ] **Krok 5: Pełne testy, lint i build**

```bash
npm test
npm run lint
npm run build
```

Oczekiwane: wszystkie PASS (154 dotychczasowe + 3 nowe = 157), lint i build
bez uwag.

- [ ] **Krok 6: Commit**

```bash
git add supabase/functions/_wspolne/podsumowanie.ts supabase/functions/_wspolne/podsumowanie.test.ts
git commit -m "Opcja pominiecia stopki mailowej w podsumowaniu"
```

---

### Zadanie 4: Szkice wydarzeń i zapis przez bota w bazie

**Pliki:**
- Modyfikacja: `supabase/schema.sql` (sekcja 18, część 2)
- Migracja: `bot_telegram_wydarzenia`

**Interfejsy:**
- Konsumuje: `members.telegram_chat_id` (Zadanie 1).
- Produkuje: tabela `telegram_szkice(member_id, wydarzenie, utworzono)`,
  `domownik_po_czacie(p_chat_id bigint) returns table (member_id uuid,
  household_id uuid, imie text)`, `dodaj_wydarzenie_bota(p_member uuid,
  p_tytul text, p_poczatek timestamp, p_koniec timestamp, p_calodniowe
  boolean, p_osoby uuid[]) returns uuid`.

- [ ] **Krok 1: Sprawdź, że tabeli jeszcze nie ma**

MCP `execute_sql`:

```sql
select to_regclass('public.telegram_szkice');
```

Oczekiwane: `null`.

- [ ] **Krok 2: Zastosuj migrację**

MCP `apply_migration`, nazwa `bot_telegram_wydarzenia`:

```sql
-- Szkic wydarzenia czekajacy na potwierdzenie "tak"/"nie" - jeden na osobe,
-- nowa propozycja nadpisuje poprzednia (member_id jest kluczem glownym).
create table if not exists public.telegram_szkice (
  member_id   uuid primary key references public.members(id) on delete cascade,
  wydarzenie  jsonb not null,
  utworzono   timestamptz not null default now()
);

alter table public.telegram_szkice enable row level security;

-- Dane potrzebne botowi do obslugi wiadomosci - jedno zapytanie zamiast
-- dwoch osobnych (member + household).
create or replace function public.domownik_po_czacie(p_chat_id bigint)
  returns table (member_id uuid, household_id uuid, imie text)
  language sql stable security definer set search_path = public
as $$
  select m.id, m.household_id, m.name
    from public.members m
   where m.telegram_chat_id = p_chat_id
$$;

revoke execute on function public.domownik_po_czacie(bigint) from public, anon, authenticated;

-- Zapis wydarzenia zaproponowanego przez bota. p_member NIE jest tu
-- weryfikowany wzgledem zadnej sesji - ufa mu tylko Edge Function, ktora
-- wczesniej ustalila je przez domownik_po_czacie(). household_id bierzemy
-- z domownika, nie z argumentu, zeby nie dalo sie podac cudzego domu.
create or replace function public.dodaj_wydarzenie_bota(
  p_member     uuid,
  p_tytul      text,
  p_poczatek   timestamp,
  p_koniec     timestamp,
  p_calodniowe boolean,
  p_osoby      uuid[]
) returns uuid
  language plpgsql volatile security definer set search_path = public
as $$
declare
  wlasny_dom uuid;
  nowe_id uuid;
begin
  select household_id into wlasny_dom from public.members where id = p_member;
  if wlasny_dom is null then
    raise exception 'Nieznany domownik.';
  end if;

  insert into public.events (title, starts_at, ends_at, all_day, household_id, created_by)
  values (p_tytul, p_poczatek, p_koniec, p_calodniowe, wlasny_dom, p_member)
  returning id into nowe_id;

  if p_osoby is not null and array_length(p_osoby, 1) > 0 then
    insert into public.event_members (event_id, member_id)
    select nowe_id, unnest(p_osoby);
  end if;

  return nowe_id;
end
$$;

revoke execute on function public.dodaj_wydarzenie_bota(uuid, text, timestamp, timestamp, boolean, uuid[])
  from public, anon, authenticated;
```

- [ ] **Krok 3: Sprawdź `domownik_po_czacie`**

Podstaw `<MID>`/`<CHATID>` z Zadania 1 (albo ustaw nowy testowy chat_id na
dowolnym domowniku).

MCP `execute_sql`:

```sql
begin;
update public.members set telegram_chat_id = 123123123
 where id = (select id from public.members where user_id is not null limit 1)
returning id, household_id, name;
-- zapisz zwrocone id/household_id/name jako <MID>/<HHID>/<IMIE>

select * from public.domownik_po_czacie(123123123);
select * from public.domownik_po_czacie(999999999);  -- nieistniejacy chat_id
rollback;
```

Oczekiwane: pierwsze zapytanie zwraca wiersz `(<MID>, <HHID>, <IMIE>)`,
drugie zwraca zero wierszy.

- [ ] **Krok 4: Sprawdź `dodaj_wydarzenie_bota` — wydarzenie bez osób**

MCP `execute_sql` (dalej w tej samej transakcji z kroku 3, albo nowa z
podstawionym `<MID>`/`<HHID>`):

```sql
begin;
select public.dodaj_wydarzenie_bota(
  '<MID>', 'Test bota', '2026-09-25T15:00:00', '2026-09-25T16:00:00', false, array[]::uuid[]
) as nowe_id \gset

select title, starts_at, ends_at, all_day, household_id, created_by
  from public.events where id = :'nowe_id';
select count(*) from public.event_members where event_id = :'nowe_id';
rollback;
```

Oczekiwane: wiersz z `household_id = <HHID>`, `created_by = <MID>`,
`all_day = false`; `count(*) = 0` (bez przypisanych osób).

Jeśli MCP `execute_sql` nie obsługuje `\gset` (to składnia `psql`), rozbij to
na dwa kroki: najpierw `select public.dodaj_wydarzenie_bota(...)`, zapisz
zwrócone `uuid` ręcznie, potem podstaw je w kolejnych zapytaniach.

- [ ] **Krok 5: Sprawdź `dodaj_wydarzenie_bota` — wydarzenie z osobą**

MCP `execute_sql`:

```sql
begin;
select public.dodaj_wydarzenie_bota(
  '<MID>', 'Test z osoba', '2026-09-26T10:00:00', '2026-09-26T11:00:00', false, array['<MID>']::uuid[]
) as nowe_id;
-- podstaw zwrocone id jako <EID>

select count(*) from public.event_members where event_id = '<EID>' and member_id = '<MID>';
rollback;
```

Oczekiwane: `count(*) = 1`.

- [ ] **Krok 6: Sprawdź, że przeglądarka nie dosięgnie tych funkcji ani tabeli**

MCP `execute_sql`:

```sql
begin;
set local role authenticated;
select count(*) from public.telegram_szkice;      -- oczekiwane: 0 (RLS bez polityk)
select public.domownik_po_czacie(1);               -- oczekiwane: permission denied
select public.dodaj_wydarzenie_bota(
  gen_random_uuid(), 'x', now(), now() + interval '1 hour', false, array[]::uuid[]
);                                                   -- oczekiwane: permission denied
rollback;
```

- [ ] **Krok 7: Posprzątaj testowy chat_id**

MCP `execute_sql`:

```sql
update public.members set telegram_chat_id = null where telegram_chat_id = 123123123;
```

- [ ] **Krok 8: Dopisz sekcję 18 (część 2) do `supabase/schema.sql` i zacommituj**

Ten sam SQL co w Kroku 2, dopisany do sekcji 18 (po tym, co dodało Zadanie 1
- bez nowego nagłówka sekcji, to ta sama sekcja 18).

```bash
git add supabase/schema.sql
git commit -m "Szkice wydarzen i zapis przez bota"
```

---

### Zadanie 5: Wysyłka wiadomości na Telegramie

**Pliki:**
- Utworzenie: `supabase/functions/_wspolne/telegram.ts`

**Interfejsy:**
- Produkuje: `wyslijWiadomosc(chatId: number, tekst: string): Promise<void>`.

Ten plik nie ma testów jednostkowych - tak samo jak `resend.ts` (Deno +
sieć), sprawdzamy go dopiero żywym testem w Zadaniu 6.

- [ ] **Krok 1: Napisz moduł**

Utwórz `supabase/functions/_wspolne/telegram.ts`:

```ts
/**
 * Jedyne miejsce w aplikacji, które wie o Telegram Bot API. Zmiana na inny
 * komunikator to zmiana tego pliku i niczego więcej.
 */

const TELEGRAM_URL = 'https://api.telegram.org/bot'

export async function wyslijWiadomosc(chatId: number, tekst: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) {
    throw new Error('Brakuje sekretu TELEGRAM_BOT_TOKEN.')
  }

  const odpowiedz = await fetch(`${TELEGRAM_URL}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: tekst }),
  })

  if (!odpowiedz.ok) {
    const tresc = (await odpowiedz.text()).slice(0, 300)
    throw new Error(`Telegram ${odpowiedz.status}: ${tresc}`)
  }
}
```

- [ ] **Krok 2: `npm run lint` — musi przejść**

```bash
npm run lint
```

Oczekiwane: bez uwag.

- [ ] **Krok 3: Commit**

```bash
git add supabase/functions/_wspolne/telegram.ts
git commit -m "Wysylka wiadomosci przez Telegram Bot API"
```

---

### Zadanie 6: Edge Function `telegram-bot`

**Pliki:**
- Utworzenie: `supabase/functions/telegram-bot/index.ts`

**Interfejsy:**
- Konsumuje: wszystko z Zadań 1-5 (`wygeneruj_kod_telegramu` pośrednio przez
  UI w Zadaniu 7, `polacz_telegram`, `domownik_po_czacie`,
  `dodaj_wydarzenie_bota`, `podsumowanie_domu` z istniejącej sekcji 16,
  `zbudujPodsumowanie`, `budujZapytanieBota`, `rozpoznajOdpowiedz`,
  `rozpoznajPotwierdzenie`, `dataDlaZakresu`, `nastepnyDzien`,
  `zlozTimestamp`, `opisPropozycji`, `zapytajGeminiNarzedzie`,
  `wyslijWiadomosc`).
- Produkuje: wdrożoną funkcję `telegram-bot`, webhook Telegrama.

- [ ] **Krok 1: Załóż bota** *(krok dla człowieka)*

1. Otwórz [@BotFather](https://t.me/BotFather) na Telegramie.
2. `/newbot`, podaj nazwę i unikalną nazwę użytkownika kończącą się na `bot`
   (np. `KokpitRodzinnyBot`).
3. BotFather odpowie tokenem (`123456:ABC-...`) — pokazuje się raz, zapisz go.

- [ ] **Krok 2: Ustaw sekret funkcji** *(krok dla człowieka)*

Panel Supabase → **Edge Functions** → **Secrets** → dodaj:

| Nazwa | Wartość |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | token z kroku 1 |

`GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` już istnieją
(pierwszy z `import-ai`, pozostałe wstrzykiwane automatycznie).

- [ ] **Krok 3: Napisz funkcję**

Utwórz `supabase/functions/telegram-bot/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  WSPOLNE,
  budujZapytanieBota,
  dataDlaZakresu,
  nastepnyDzien,
  opisPropozycji,
  rozpoznajOdpowiedz,
  rozpoznajPotwierdzenie,
  zlozTimestamp,
  type ProponowaneWydarzenie,
} from '../_wspolne/botAI.ts'
import { zapytajGeminiNarzedzie } from '../_wspolne/gemini.ts'
import { zbudujPodsumowanie, type DanePodsumowania } from '../_wspolne/podsumowanie.ts'
import { wyslijWiadomosc } from '../_wspolne/telegram.ts'

const SZKIC_WAZNY_MINUT = 10

type Domownik = { member_id: string; household_id: string; imie: string }

Deno.serve(async (req) => {
  const baza = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  let update: { message?: { chat: { id: number }; text?: string } }
  try {
    update = await req.json()
  } catch {
    return odpowiedzOk()
  }

  const wiadomosc = update.message
  if (!wiadomosc?.text) return odpowiedzOk()

  const chatId = wiadomosc.chat.id
  const tekst = wiadomosc.text.trim()

  try {
    if (tekst.startsWith('/start')) {
      await obsluzStart(baza, chatId, tekst)
      return odpowiedzOk()
    }

    const { data: domownicyDb } = await baza.rpc('domownik_po_czacie', { p_chat_id: chatId })
    const domownik = domownicyDb?.[0] as Domownik | undefined

    if (!domownik) {
      await wyslijWiadomosc(
        chatId,
        'Nie znam Cię jeszcze. Połącz konto kodem z aplikacji: Mój dom → Bot na Telegramie.',
      )
      return odpowiedzOk()
    }

    const { data: szkicDb } = await baza
      .from('telegram_szkice')
      .select('wydarzenie, utworzono')
      .eq('member_id', domownik.member_id)
      .maybeSingle()

    const szkicSwiezy =
      szkicDb && Date.now() - new Date(szkicDb.utworzono).getTime() < SZKIC_WAZNY_MINUT * 60_000

    if (szkicSwiezy) {
      await obsluzPotwierdzenie(baza, domownik, chatId, tekst, szkicDb.wydarzenie as ProponowaneWydarzenie)
    } else {
      await obsluzWiadomosc(baza, domownik, chatId, tekst)
    }

    return odpowiedzOk()
  } catch (e) {
    console.error(e)
    await wyslijWiadomosc(chatId, 'Coś poszło nie tak, spróbuj ponownie za chwilę.').catch(() => {})
    return odpowiedzOk()
  }
})

async function obsluzStart(
  baza: ReturnType<typeof createClient>,
  chatId: number,
  tekst: string,
): Promise<void> {
  const kod = tekst.replace('/start', '').trim()
  if (!kod) {
    await wyslijWiadomosc(chatId, 'Wyślij /start i kod z aplikacji (Mój dom → Bot na Telegramie).')
    return
  }

  const { data: udalo } = await baza.rpc('polacz_telegram', { p_kod: kod, p_chat_id: chatId })
  await wyslijWiadomosc(
    chatId,
    udalo
      ? 'Połączono! Napisz np. "co mam jutro?" albo "dodaj wizytę u dentysty w piątek o 15".'
      : 'Nieprawidłowy albo wygasły kod. Wygeneruj nowy w aplikacji: Mój dom → Bot na Telegramie.',
  )
}

async function obsluzPotwierdzenie(
  baza: ReturnType<typeof createClient>,
  domownik: Domownik,
  chatId: number,
  tekst: string,
  wydarzenie: ProponowaneWydarzenie,
): Promise<void> {
  const decyzja = rozpoznajPotwierdzenie(tekst)

  if (decyzja === 'niejasne') {
    await wyslijWiadomosc(chatId, 'Napisz "tak" żeby zapisać, albo "nie" żeby anulować.')
    return
  }

  await baza.from('telegram_szkice').delete().eq('member_id', domownik.member_id)

  if (decyzja === 'nie') {
    await wyslijWiadomosc(chatId, 'OK, nie dodaję.')
    return
  }

  const czlonkowie = await pobierzCzlonkow(baza, domownik.household_id)
  const idOsoby =
    wydarzenie.czlonek === WSPOLNE
      ? []
      : [czlonkowie.get(wydarzenie.czlonek)].filter((id): id is string => Boolean(id))

  await baza.rpc('dodaj_wydarzenie_bota', {
    p_member: domownik.member_id,
    p_tytul: wydarzenie.tytul,
    p_poczatek: zlozTimestamp(wydarzenie.data, wydarzenie.calodniowe ? '00:00' : wydarzenie.start),
    p_koniec: wydarzenie.calodniowe
      ? zlozTimestamp(nastepnyDzien(wydarzenie.data), '00:00')
      : zlozTimestamp(wydarzenie.data, wydarzenie.koniec),
    p_calodniowe: wydarzenie.calodniowe,
    p_osoby: idOsoby,
  })

  await wyslijWiadomosc(chatId, 'Dodane ✅')
}

async function obsluzWiadomosc(
  baza: ReturnType<typeof createClient>,
  domownik: Domownik,
  chatId: number,
  tekst: string,
): Promise<void> {
  const kluczApi = Deno.env.get('GEMINI_API_KEY')
  if (!kluczApi) {
    await wyslijWiadomosc(chatId, 'Bot nie jest jeszcze skonfigurowany (brak klucza Gemini).')
    return
  }

  const czlonkowie = await pobierzCzlonkow(baza, domownik.household_id)
  const imiona = [...czlonkowie.keys()]

  const zapytanie = budujZapytanieBota(new Date(), imiona, tekst)
  const wywolanie = await zapytajGeminiNarzedzie(zapytanie, kluczApi)
  const odpowiedz = rozpoznajOdpowiedz(wywolanie, imiona)

  if (odpowiedz.rodzaj === 'tekst') {
    await wyslijWiadomosc(chatId, odpowiedz.tresc)
    return
  }

  if (odpowiedz.rodzaj === 'podsumowanie') {
    const dzien = dataDlaZakresu(odpowiedz.zakres, new Date())
    const { data: dane, error } = await baza.rpc('podsumowanie_domu', {
      p_dom: domownik.household_id,
      p_dzien: dzien,
    })
    if (error) throw new Error(error.message)
    const mail = zbudujPodsumowanie(
      dane as DanePodsumowania,
      { memberId: domownik.member_id, imie: domownik.imie, email: '' },
      { pokazStopke: false },
    )
    await wyslijWiadomosc(chatId, mail.tekst)
    return
  }

  await baza.from('telegram_szkice').upsert({
    member_id: domownik.member_id,
    wydarzenie: odpowiedz.wydarzenie,
    utworzono: new Date().toISOString(),
  })
  await wyslijWiadomosc(chatId, `Zapisać: ${opisPropozycji(odpowiedz.wydarzenie)}? (tak/nie)`)
}

async function pobierzCzlonkow(
  baza: ReturnType<typeof createClient>,
  householdId: string,
): Promise<Map<string, string>> {
  const { data } = await baza.from('members').select('id, name').eq('household_id', householdId)
  return new Map((data ?? []).map((c: { id: string; name: string }) => [c.name, c.id]))
}

function odpowiedzOk(): Response {
  return new Response('ok', { status: 200 })
}
```

- [ ] **Krok 4: Wdróż funkcję**

MCP `deploy_edge_function`, nazwa `telegram-bot`, pliki:
`supabase/functions/telegram-bot/index.ts` (entrypoint) oraz
`supabase/functions/_wspolne/botAI.ts`, `gemini.ts`, `podsumowanie.ts`,
`telegram.ts`. **`verify_jwt: false`** — Telegram nie wysyła nagłówka
`Authorization` z tokenem JWT Supabase, tylko sam webhook; funkcja sama
sprawdza `chat_id` przez `domownik_po_czacie`, więc nieznany rozmówca dostaje
tylko instrukcję parowania i nic więcej.

Znana uproszczenie V1: każdy, kto zna/zgadnie cudzy `chat_id`, mógłby wysłać
żądanie podszywające się pod webhook Telegrama i "napisać" jako ta osoba.
Telegram wspiera opcjonalny `secret_token` w `setWebhook`, sprawdzany potem
nagłówkiem `X-Telegram-Bot-Api-Secret-Token` - to naturalne wzmocnienie na
później, pominięte tu dla prostoty V1.

Potem MCP `list_edge_functions` — funkcja ma być na liście ze statusem
`ACTIVE`.

- [ ] **Krok 5: Zarejestruj webhook** *(krok dla człowieka — potrzebny token bota)*

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://fqviwnzinpndyprcovxw.supabase.co/functions/v1/telegram-bot"
```

Oczekiwane: `{"ok":true,"result":true,"description":"Webhook was set"}`.

- [ ] **Krok 6: Sprawdź status webhooka**

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Oczekiwane: `"url"` zgadza się z adresem funkcji, `"last_error_message"` puste.

- [ ] **Krok 7: Commit**

```bash
git add supabase/functions/telegram-bot supabase/functions/_wspolne/botAI.ts supabase/functions/_wspolne/gemini.ts
git commit -m "Edge Function bota na Telegramie"
```

Żywy test całej rozmowy (parowanie, pytanie, dodanie wydarzenia) czeka do
Zadania 8, po dodaniu ekranu parowania w apce.

---

### Zadanie 7: Parowanie w ekranie „Mój dom"

**Pliki:**
- Modyfikacja: `src/lib/supabase.ts`
- Modyfikacja: `src/useDomownicy.ts`
- Modyfikacja: `src/MojDom.tsx`
- Modyfikacja: `src/style/wspolne.css`
- Modyfikacja: `.env.example`

**Interfejsy:**
- Konsumuje: `wygeneruj_kod_telegramu()` z Zadania 1.
- Produkuje: `useDomownicy().polaczTelegram(): Promise<string | null>`.

- [ ] **Krok 1: Dopisz pole do typu**

W `src/lib/supabase.ts`, w typie `DomownikDb`, po `digest_at: string`:

```ts
  /** Chat_id Telegrama po sparowaniu - null, dopóki domownik nie połączy konta. */
  telegram_chat_id: number | null
```

- [ ] **Krok 2: Dodaj operację do hooka**

W `src/useDomownicy.ts`, po funkcji `ustawPowiadomienia`, dopisz:

```ts
  /**
   * Kod parowania z botem - jednorazowy, ważny 15 minut po stronie bazy.
   * Nie odświeżamy tu listy: `telegram_chat_id` zmieni się dopiero, gdy bot
   * sparuje konto, a tamten update i tak przyjdzie przez `useNaZywo` wyżej.
   */
  const polaczTelegram = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase.rpc('wygeneruj_kod_telegramu')
    if (error) {
      onBlad(`Nie udało się wygenerować kodu: ${error.message}`)
      return null
    }
    return data as string
  }, [onBlad])
```

I dopisz `polaczTelegram` do zwracanego obiektu:

```ts
  return {
    domownicy,
    ladowanie,
    dodaj,
    zmien,
    usun,
    proponowanyKolor,
    ustawPowiadomienia,
    polaczTelegram,
  }
```

- [ ] **Krok 3: Dodaj zmienną środowiskową**

W `.env.example`, na końcu:

```
VITE_TELEGRAM_BOT_USERNAME=TwojBot
```

- [ ] **Krok 4: Dodaj sekcję w `MojDom.tsx`**

Do typu `Props` dopisz:

```ts
  onPolaczTelegram: () => Promise<string | null>
```

Do listy parametrów komponentu `MojDom` dopisz `onPolaczTelegram`, a zaraz
po `<Powiadomienia .../>` wstaw:

```tsx
      <BotTelegram
        ja={domownicy.find((d) => d.id === mojeId)}
        onGeneruj={onPolaczTelegram}
      />
```

Na końcu pliku, po funkcji `Powiadomienia`, dopisz komponent:

```tsx
const NAZWA_BOTA = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined

/**
 * Parowanie z botem na Telegramie - kod jednorazowy z apki, wysyłany do bota
 * jako `/start KOD`. Stan "połączono" przychodzi sam przez Realtime
 * (patrz komentarz przy `polaczTelegram` w useDomownicy.ts).
 */
function BotTelegram({
  ja,
  onGeneruj,
}: {
  ja: DomownikDb | undefined
  onGeneruj: () => Promise<string | null>
}) {
  const [kod, setKod] = useState<string | null>(null)
  const [generowanie, setGenerowanie] = useState(false)

  if (!ja) return null

  async function generuj() {
    setGenerowanie(true)
    setKod(await onGeneruj())
    setGenerowanie(false)
  }

  return (
    <section className="karta">
      <h2 className="panel-tytul">Bot na Telegramie</h2>
      <p className="panel-dzien">
        Napisz do bota „co mam dziś" albo „dodaj wizytę u dentysty w piątek o
        15" - zrozumie zwykłe zdanie.
      </p>

      {ja.telegram_chat_id ? (
        <p className="polaczono">✓ Połączono</p>
      ) : kod ? (
        <div className="kod-telegramu">
          <p>
            Otwórz{' '}
            {NAZWA_BOTA ? (
              <a href={`https://t.me/${NAZWA_BOTA}`} target="_blank" rel="noreferrer">
                t.me/{NAZWA_BOTA}
              </a>
            ) : (
              'bota na Telegramie'
            )}{' '}
            i wyślij:
          </p>
          <p className="kod">/start {kod}</p>
          <p className="panel-dzien">Kod ważny 15 minut.</p>
        </div>
      ) : (
        <button
          type="button"
          className="dodaj-wydarzenie-gorne"
          onClick={() => void generuj()}
          disabled={generowanie}
        >
          Połącz z Telegramem
        </button>
      )}
    </section>
  )
}
```

- [ ] **Krok 5: Dodaj style**

Na końcu `src/style/wspolne.css`:

```css
/* Parowanie z botem na Telegramie - kod jednorazowy, patrz MojDom.tsx. */
.polaczono {
  margin: 0;
  color: var(--akcent);
  font-weight: 600;
}

.kod-telegramu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kod {
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--akcent-jasny);
  font-family: monospace;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
}
```

- [ ] **Krok 6: Przekaż funkcję z `App.tsx`**

W `src/App.tsx`, w bloku `<MojDom ... />`, po `onUstawPowiadomienia`:

```tsx
          onPolaczTelegram={osoby.polaczTelegram}
```

- [ ] **Krok 7: Sprawdź w przeglądarce**

```bash
npm run dev
```

Wejdź na „Mój dom". Oczekiwane:

1. Sekcja „Bot na Telegramie" widoczna, przycisk „Połącz z Telegramem".
2. Klik pokazuje 6-znakowy kod i (jeśli ustawiono `VITE_TELEGRAM_BOT_USERNAME`
   w `.env`) link do bota.
3. Sprawdź w MCP `execute_sql`, że kod naprawdę wylądował w
   `telegram_kody` (`select * from telegram_kody order by wygasa desc limit
   1;`).

- [ ] **Krok 8: Testy, lint i build**

```bash
npm test
npm run lint
npm run build
```

Oczekiwane: wszystko przechodzi (157 testów - ten krok nie dodaje nowych,
komponenty UI nie mają tu testów jednostkowych, tak jak `Powiadomienia`).

- [ ] **Krok 9: Commit**

```bash
git add src .env.example
git commit -m "Parowanie z botem na Telegramie na ekranie Moj dom"
```

---

### Zadanie 8: README i próba końcowa

**Pliki:**
- Modyfikacja: `README.md`

- [ ] **Krok 1: Dodaj sekcję o funkcji**

W `README.md`, po sekcji „Poranne podsumowanie", wstaw:

```markdown
## Bot na Telegramie

Domownik z kontem może połączyć swój Telegram z Kokpitem (ekran „Mój dom" →
„Bot na Telegramie") i pisać do bota zwykłym językiem: „co mam dziś?", „co
mam jutro?", „dodaj wizytę u dentysty w piątek o 15". Bot rozpoznaje intencję
przez Gemini i albo odpowiada podsumowaniem dnia (ten sam kawałek co poranny
mail), albo proponuje wydarzenie i czeka na „tak"/„nie", zanim je zapisze.

Parowanie konta idzie przez jednorazowy kod ważny 15 minut - Telegram nie ma
dostępu do maila/hasła, więc to jedyny sposób, żeby bot wiedział, kto pisze.

Bot na razie tylko dodaje pojedyncze wydarzenia - edycja, usuwanie i
wydarzenia powtarzające się zostają w samej aplikacji.
```

- [ ] **Krok 2: Dodaj punkt do konfiguracji**

W sekcji „Konfiguracja bazy", po punkcie 5 (Poranne podsumowanie), wstaw:

```markdown
6. **Bot na Telegramie** (opcjonalne — bez tego reszta aplikacji działa):

   - Załóż bota przez [@BotFather](https://t.me/BotFather) (`/newbot`),
     zapisz token.
   - Panel Supabase → **Edge Functions → Secrets**: `TELEGRAM_BOT_TOKEN`.
   - Wdróż funkcję: `supabase functions deploy telegram-bot --no-verify-jwt`.
   - Zarejestruj webhook:
     `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://TWOJ-PROJEKT.supabase.co/functions/v1/telegram-bot"`.
   - W `.env`: `VITE_TELEGRAM_BOT_USERNAME=<nazwa_bota_bez_@>` (żeby ekran
     „Mój dom" pokazywał link do bota).
```

- [ ] **Krok 3: Uzupełnij tabelę „Struktura"**

Dopisz trzy wiersze, przed wierszem `supabase/schema.sql`:

| Plik | Do czego służy |
| --- | --- |
| `supabase/functions/telegram-bot/index.ts` | Webhook bota - parowanie, pytania, propozycje, potwierdzenia |
| `supabase/functions/_wspolne/botAI.ts` | Zapytanie do Gemini (3 narzędzia) i walidacja - silnik bota |
| `supabase/functions/_wspolne/telegram.ts` | Wysyłka wiadomości - jedyne miejsce z Telegram Bot API |

- [ ] **Krok 4: Próba końcowa na żywo**

1. W „Mój dom" kliknij „Połącz z Telegramem", zapisz kod.
2. Otwórz bota na Telegramie, wyślij `/start KOD`. Oczekiwane: powitanie.
3. Napisz „co mam dziś?". Oczekiwane: podsumowanie dnia (albo „Spokojny
   dzień…", jeśli nic nie ma) — bez zdania „Wyłączysz to w Kokpicie".
4. Napisz „dodaj test bota jutro o 12 na godzinę". Oczekiwane: pytanie
   „Zapisać: …? (tak/nie)".
5. Odpowiedz „tak". Oczekiwane: „Dodane ✅"; sprawdź w aplikacji (albo MCP
   `execute_sql`: `select title, starts_at from events order by created_at
   desc limit 1;`), że wydarzenie faktycznie tam jest.
6. Napisz coś niezwiązanego, np. „jaka jest stolica Francji?". Oczekiwane:
   krótka, grzeczna odpowiedź tłumacząca, co bot potrafi (narzędzie
   `odpowiedz_tekstem`) — nie zgadywanie odpowiedzi.

Jeśli coś nie działa, sprawdź `getWebhookInfo` (Zadanie 6, Krok 6) i logi
funkcji w panelu Supabase (**Edge Functions → telegram-bot → Logs**).

- [ ] **Krok 5: Commit**

```bash
git add README.md
git commit -m "README: bot na Telegramie"
```

---

## Kolejność i zależności

```
1 (parowanie w bazie) ─┐
                       ├─> 4 (szkice + zapis) ─┐
2 (silnik Gemini) ─────┤                       ├─> 6 (Edge Function) ─> 8 (README)
3 (bez stopki) ────────┘                       │
5 (wysylka Telegram) ───────────────────────────┘
7 (ekran parowania) zalezy tylko od 1 - mozna zrobic w dowolnym momencie po
  zadaniu 1, rownolegle do 2-6.
```

Zadania 6 i 8 mają kroki, których nie da się wykonać z poziomu MCP: token
bota z BotFather i rejestracja webhooka musi zrobić człowiek.
