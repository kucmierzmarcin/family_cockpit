# Poranne podsumowanie dnia — plan wdrożenia

> **Dla agentów:** WYMAGANY SUB-SKILL: użyj `superpowers:subagent-driven-development`
> (zalecane) albo `superpowers:executing-plans`, żeby wykonać ten plan zadanie po
> zadaniu. Kroki mają checkboxy (`- [ ]`) do odhaczania.

**Cel:** Raz dziennie, o godzinie wybranej przez domownika, wysłać mu mailem to,
co dziś czeka jego dom — kalendarz, świeże ogłoszenia z tablicy i liczniki
zakupów.

**Architektura:** `pg_cron` co 15 minut woła przez `pg_net` Edge Function.
Funkcja pyta bazę, komu właśnie wybiła godzina (i od razu go „zajmuje", żeby
drugi przebieg nie wysłał drugi raz), pobiera dane podsumowania raz na dom,
składa treść czystym TypeScriptem i wysyła przez Resend. Logika treści nie wie
nic o poczcie — ma jej później użyć bot na komunikatorze.

**Stack:** Supabase (Postgres 17, RLS, Edge Functions/Deno, pg_cron, pg_net,
Vault), React 19 + TypeScript + Vite 8, vitest 5, Resend.

**Spec:** [`docs/superpowers/specs/2026-09-07-poranne-podsumowanie-design.md`](../specs/2026-09-07-poranne-podsumowanie-design.md)

## Ograniczenia globalne

- Nazwy kolumn w bazie po angielsku, nazwy funkcji i polityk po polsku — tak
  jest w całym `supabase/schema.sql`.
- Każda zmiana schematu ląduje w **dwóch** miejscach: jako migracja w projekcie
  Supabase (MCP `apply_migration`) **i** dopisana do `supabase/schema.sql`, bo
  ten plik jest jedynym źródłem prawdy dla kogoś, kto stawia bazę od zera.
- Nowe funkcje w bazie: `security definer set search_path = public`, a po
  utworzeniu **`revoke execute … from anon, authenticated`** wszędzie tam, gdzie
  funkcja jest tylko dla klucza serwisowego. Postgres domyślnie daje `execute`
  roli `public` — bez `revoke` cron-owe funkcje byłyby wołalne z przeglądarki.
- Strefa czasowa: `Europe/Warsaw`, liczona **w bazie**. Kod TypeScript nigdy nie
  przelicza stref.
- Godziny wysyłki: od `05:00` do `10:00` co 30 minut.
- `starts_at` / `ends_at` to `timestamp` bez strefy w formacie
  `'RRRR-MM-DDTGG:MM:SS'`. Koniec jest **wyłączny**.
- Projekt Supabase: ref `fqviwnzinpndyprcovxw`.
- Testy uruchamiamy `npm test`; lint `npm run lint`. Oba muszą przechodzić przed
  każdym commitem.
- Commity po polsku, bez polskich znaków w treści (tak wyglądają dotychczasowe),
  stopka `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## Struktura plików

| Plik | Odpowiedzialność |
| --- | --- |
| `supabase/schema.sql` | modyfikacja — kolumny przy `members`, tabela `digest_log`, cztery funkcje, cron |
| `supabase/functions/_wspolne/podsumowanie.ts` | nowy — z danych domu robi temat, HTML i tekst. Zero zależności |
| `supabase/functions/_wspolne/podsumowanie.test.ts` | nowy — testy powyższego (vitest) |
| `supabase/functions/_wspolne/resend.ts` | nowy — jedyne miejsce, które gada z dostawcą poczty |
| `supabase/functions/poranne-podsumowanie/index.ts` | nowy — spina bazę, treść i wysyłkę |
| `src/lib/supabase.ts` | modyfikacja — pola `digest_enabled`, `digest_at` w `DomownikDb` |
| `src/useDomownicy.ts` | modyfikacja — `ustawPowiadomienia` |
| `src/MojDom.tsx` | modyfikacja — sekcja „Powiadomienia" przy własnym wierszu |
| `src/App.tsx` | modyfikacja — przekazanie nowej funkcji do `MojDom` |
| `src/App.css` | modyfikacja — style sekcji |
| `README.md` | modyfikacja — konfiguracja Resend i crona, opis nowych plików |

`podsumowanie.ts` **nie importuje niczego** — ani z `src/`, ani z Deno.
Powielenie trzyliniowego formatowania godziny jest tańsze niż wciągnięcie
przeglądarkowego drzewa źródeł do bundla Deno. `supabase/` zostaje poza
`tsconfig.app.json` (tam jest `"include": ["src"]`), więc `npm run build` nie
tyka kodu Deno; vitest i tak znajdzie testy, bo domyślnie skanuje cały projekt.

---

### Zadanie 1: Ustawienia powiadomień w bazie

**Pliki:**
- Modyfikacja: `supabase/schema.sql` (dopisanie sekcji 14 na końcu)
- Migracja: `powiadomienia_ustawienia`

**Interfejsy:**
- Produkuje: kolumny `members.digest_enabled boolean`, `members.digest_at time`
  oraz `ustaw_powiadomienia(p_wlaczone boolean, p_godzina time) returns void`.

- [ ] **Krok 1: Sprawdź, że kolumn jeszcze nie ma**

MCP `execute_sql`:

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'members'
   and column_name in ('digest_enabled', 'digest_at');
```

Oczekiwane: pusty wynik.

- [ ] **Krok 2: Zastosuj migrację**

MCP `apply_migration`, nazwa `powiadomienia_ustawienia`:

```sql
alter table public.members
  add column if not exists digest_enabled boolean not null default false,
  add column if not exists digest_at      time    not null default '07:00';

-- Zapis przez funkcję, nie przez update. Polityka "Domownicy - zmiana" pozwala
-- zmieniać wiersze tylko rodzicowi, a dopisanie "każdy zmienia swój wiersz"
-- dałoby dziecku prawo przestawić sobie `role` na 'rodzic' - RLS filtruje
-- wiersze, nie kolumny. Kolumny ogranicza więc ta funkcja.
create or replace function public.ustaw_powiadomienia(p_wlaczone boolean, p_godzina time)
  returns void
  language plpgsql volatile security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Trzeba być zalogowanym.';
  end if;

  update public.members
     set digest_enabled = p_wlaczone,
         digest_at      = p_godzina
   where user_id = auth.uid();
end
$$;

revoke execute on function public.ustaw_powiadomienia(boolean, time) from public, anon;
grant  execute on function public.ustaw_powiadomienia(boolean, time) to authenticated;
```

- [ ] **Krok 3: Sprawdź kolumny i wartości domyślne**

MCP `execute_sql`:

```sql
select name, digest_enabled, digest_at from public.members order by created_at;
```

Oczekiwane: każdy wiersz ma `false` i `07:00:00`.

- [ ] **Krok 4: Sprawdź funkcję z perspektywy zwykłego domownika**

Podstaw pod `<UID>` wynik `select user_id from public.members where user_id is not null limit 1;`

MCP `execute_sql`:

```sql
begin;
select set_config('request.jwt.claims',
                  json_build_object('sub', '<UID>', 'role', 'authenticated')::text, true);
set local role authenticated;

select public.ustaw_powiadomienia(true, '06:30');

-- własny wiersz
select name, role, digest_enabled, digest_at
  from public.members where user_id = '<UID>';

-- cudze wiersze
select count(*) as cudze_ruszone
  from public.members
 where user_id is distinct from '<UID>'::uuid
   and (digest_enabled or digest_at <> '07:00');
rollback;
```

Oczekiwane: własny wiersz ma `digest_enabled = true`, `digest_at = 06:30:00`
i **`role` bez zmiany**; `cudze_ruszone = 0`.

Te dwa sprawdzenia są sednem zadania: funkcja nie może być ani furtką do
podniesienia sobie uprawnień, ani do grzebania w cudzych ustawieniach.

- [ ] **Krok 5: Sprawdź, że wywołanie bez logowania odpada**

MCP `execute_sql`:

```sql
begin;
set local role anon;
select public.ustaw_powiadomienia(true, '06:30');
rollback;
```

Oczekiwane: błąd `permission denied for function ustaw_powiadomienia`.

- [ ] **Krok 6: Dopisz to samo do `supabase/schema.sql`**

Na końcu pliku, po sekcji 13, dokładnie ten sam SQL co w kroku 2, poprzedzony
nagłówkiem w stylu pozostałych sekcji:

```sql
-- ============================================================
--  14. Poranne podsumowanie - ustawienia domownika
-- ============================================================
```

- [ ] **Krok 7: Commit**

```bash
git add supabase/schema.sql
git commit -m "Ustawienia porannego podsumowania w bazie"
```

---

### Zadanie 2: Dziennik wysyłek i zajmowanie odbiorcy

**Pliki:**
- Modyfikacja: `supabase/schema.sql` (sekcja 15)
- Migracja: `powiadomienia_dziennik`

**Interfejsy:**
- Konsumuje: `members.digest_enabled`, `members.digest_at` z zadania 1.
- Produkuje:
  - tabela `digest_log(id, member_id, sent_for, status, attempts, error, claimed_at, sent_at)`
  - `do_wyslania(p_teraz timestamptz default now()) returns table (log_id uuid, id_domownika uuid, id_domu uuid, adres text, imie text, dzien date)`
  - `zamknij_wysylke(p_log uuid, p_blad text default null) returns void`

- [ ] **Krok 1: Sprawdź, że tabeli nie ma**

MCP `execute_sql`:

```sql
select to_regclass('public.digest_log');
```

Oczekiwane: `null`.

- [ ] **Krok 2: Zastosuj migrację**

MCP `apply_migration`, nazwa `powiadomienia_dziennik`:

```sql
-- Dziennik wysyłek. `unique (member_id, sent_for)` nie jest ozdobą: cron chodzi
-- co 15 minut i dwa przebiegi, które się na siebie nałożą, muszą wysłać jeden
-- mail, nie dwa. Drugi odbije się od tego indeksu.
create table if not exists public.digest_log (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  sent_for   date not null,
  status     text not null default 'w_toku',
  attempts   int  not null default 1,
  error      text,
  claimed_at timestamptz not null default now(),
  sent_at    timestamptz,
  constraint digest_log_status_check check (status in ('w_toku', 'wyslane', 'blad')),
  unique (member_id, sent_for)
);

create index if not exists digest_log_dzien_idx on public.digest_log (sent_for);

-- RLS włączone i ani jednej polityki: dziennik należy do klucza serwisowego,
-- przeglądarka nie ma tu czego szukać. Klucz serwisowy omija RLS.
alter table public.digest_log enable row level security;

-- Wybór i zajęcie odbiorcy w JEDNYM zapytaniu. Rozbicie tego na "najpierw
-- wybierz, potem oznacz" otwiera okno, w którym dwa przebiegi wezmą tę samą
-- osobę. Kto wstawił wiersz, ten wysyła.
--
-- Okno `digest_at .. digest_at + 2h` zamiast punktu w czasie: zatkany cron albo
-- chwilowa awaria nadrabiają zaległość, zamiast gubić dzień.
--
-- Nazwy kolumn wyniku celowo inne niż kolumny tabel - w funkcji `language sql`
-- nazwy z RETURNS TABLE są widoczne jako zmienne i kolidowałyby z `member_id`
-- czy `email`.
create or replace function public.do_wyslania(p_teraz timestamptz default now())
  returns table (log_id uuid, id_domownika uuid, id_domu uuid,
                 adres text, imie text, dzien date)
  language sql volatile security definer set search_path = public
as $$
  with chwila as (
    select (p_teraz at time zone 'Europe/Warsaw') as lokalna
  ),
  kandydaci as (
    select m.id, m.household_id, m.email, m.name, (c.lokalna)::date as dzien
      from public.members m, chwila c
     where m.digest_enabled
       and m.user_id is not null
       and m.email is not null
       and (c.lokalna)::time >= m.digest_at
       and (c.lokalna)::time <  m.digest_at + interval '2 hours'
  ),
  zajete as (
    insert into public.digest_log as dl (member_id, sent_for)
    select k.id, k.dzien from kandydaci k
    on conflict (member_id, sent_for) do update
       set status     = 'w_toku',
           attempts   = dl.attempts + 1,
           claimed_at = now(),
           error      = null
     where (dl.status = 'blad'   and dl.attempts < 3)
        or (dl.status = 'w_toku' and dl.claimed_at < now() - interval '15 minutes')
    returning dl.id, dl.member_id
  )
  select z.id, k.id, k.household_id, k.email, k.name, k.dzien
    from zajete z
    join kandydaci k on k.id = z.member_id
$$;

-- Jedna funkcja na oba wyjścia - sukces i porażka różnią się tu wyłącznie tym,
-- czy jest treść błędu.
create or replace function public.zamknij_wysylke(p_log uuid, p_blad text default null)
  returns void
  language sql volatile security definer set search_path = public
as $$
  update public.digest_log
     set status  = case when p_blad is null then 'wyslane' else 'blad' end,
         error   = p_blad,
         sent_at = case when p_blad is null then now() else null end
   where id = p_log
$$;

revoke execute on function public.do_wyslania(timestamptz)     from public, anon, authenticated;
revoke execute on function public.zamknij_wysylke(uuid, text)  from public, anon, authenticated;
```

- [ ] **Krok 3: Przygotuj sobie odbiorcę testowego**

MCP `execute_sql` — włącz podsumowanie na 7:00 pierwszemu domownikowi z kontem:

```sql
update public.members
   set digest_enabled = true, digest_at = '07:00'
 where id = (select id from public.members
              where user_id is not null and email is not null
              order by created_at limit 1)
returning id, name, email, digest_at;
```

Zapisz zwrócone `id` — przyda się niżej jako `<MID>`.

- [ ] **Krok 4: Sprawdź wybór i jednokrotność**

MCP `execute_sql` (9 września 2026 Polska to UTC+2, więc `05:05Z` to lokalne `07:05`):

```sql
select * from public.do_wyslania('2026-09-09 05:05:00+00');
select * from public.do_wyslania('2026-09-09 05:20:00+00');
select status, attempts, sent_for from public.digest_log where member_id = '<MID>';
```

Oczekiwane: pierwsze wywołanie zwraca jeden wiersz z `dzien = 2026-09-09`,
drugie **zero wierszy**, w dzienniku jeden wpis `w_toku`, `attempts = 1`.

- [ ] **Krok 5: Sprawdź, że poza oknem nikt się nie kwalifikuje**

MCP `execute_sql`:

```sql
select count(*) from public.do_wyslania('2026-09-10 12:00:00+00');  -- 14:00 lokalnie
```

Oczekiwane: `0`.

- [ ] **Krok 5a: Sprawdź, że osoba bez konta się nie kwalifikuje**

Adres przy osobie służy zaproszeniu, nie subskrypcji — ktoś, kto się nie loguje,
nie ma jak tego wyłączyć, więc nie może tego dostawać.

MCP `execute_sql`:

```sql
begin;
insert into public.members (household_id, name, color, role, email, digest_enabled, digest_at)
values ((select id from public.households limit 1),
        'Bez konta', 'zielony', 'dziecko', 'bezkonta@dom.pl', true, '07:00');

select count(*) from public.do_wyslania('2026-09-09 05:05:00+00') where imie = 'Bez konta';
rollback;
```

Oczekiwane: `0`.

- [ ] **Krok 6: Sprawdź ponawianie po błędzie i zamknięcie sukcesem**

MCP `execute_sql`:

```sql
-- porażka wraca do puli
select public.zamknij_wysylke(
  (select id from public.digest_log where member_id = '<MID>' and sent_for = '2026-09-09'),
  'Resend 429: za dużo');
select count(*) from public.do_wyslania('2026-09-09 05:35:00+00');   -- oczekiwane: 1
select status, attempts from public.digest_log where member_id = '<MID>'; -- w_toku, 2

-- sukces zamyka temat na ten dzień
select public.zamknij_wysylke(
  (select id from public.digest_log where member_id = '<MID>' and sent_for = '2026-09-09'));
select count(*) from public.do_wyslania('2026-09-09 05:50:00+00');   -- oczekiwane: 0
select status, sent_at is not null from public.digest_log where member_id = '<MID>';
```

Oczekiwane, po kolei: `1`, `w_toku/2`, `0`, `wyslane/true`.

- [ ] **Krok 7: Sprawdź, że przeglądarka nie dosięgnie dziennika**

MCP `execute_sql`:

```sql
begin;
set local role authenticated;
select count(*) from public.digest_log;      -- oczekiwane: 0 (RLS bez polityk)
select public.do_wyslania();                 -- oczekiwane: permission denied
rollback;
```

- [ ] **Krok 8: Posprzątaj po testach**

MCP `execute_sql`:

```sql
delete from public.digest_log where sent_for = '2026-09-09';
```

- [ ] **Krok 9: Dopisz sekcję 15 do `supabase/schema.sql` i zacommituj**

```bash
git add supabase/schema.sql
git commit -m "Dziennik wysylek i zajmowanie odbiorcy"
```

---

### Zadanie 3: Dane podsumowania dla domu

**Pliki:**
- Modyfikacja: `supabase/schema.sql` (sekcja 16)
- Migracja: `powiadomienia_dane`

**Interfejsy:**
- Produkuje: `podsumowanie_domu(p_dom uuid, p_dzien date) returns jsonb` o kształcie:

```json
{
  "dzien": "2026-09-09",
  "wydarzenia": [{ "id": "…", "title": "…", "starts_at": "2026-09-09T08:00:00",
                   "ends_at": "2026-09-09T09:30:00", "all_day": false,
                   "osoby": [{ "id": "…", "name": "Ola" }] }],
  "notatki":    [{ "id": "…", "content": "…", "pinned": true, "autor": "Marek" }],
  "listy":      [{ "id": "…", "name": "Spożywcze", "pozostalo": 4 }]
}
```

- [ ] **Krok 1: Zastosuj migrację**

MCP `apply_migration`, nazwa `powiadomienia_dane`:

```sql
-- Komplet "co dziś w tym domu", liczony RAZ NA DOM, nie raz na osobę.
-- Ta funkcja nie wie, że istnieje poczta - i o to chodzi. Bot na komunikatorze
-- ma sięgnąć po nią, a nie napisać tego samego drugi raz.
create or replace function public.podsumowanie_domu(p_dom uuid, p_dzien date)
  returns jsonb
  language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'dzien', p_dzien,

    -- Wydarzenia przecinające dobę, więc wyjazd 9-11 września wchodzi także
    -- 10-go. Koniec wyłączny, tak jak wszędzie w tej aplikacji.
    'wydarzenia', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.all_day desc, w.starts_at)
        from (
          select e.id, e.title, e.starts_at, e.ends_at, e.all_day,
                 coalesce((
                   select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name)
                                    order by m.created_at)
                     from public.event_members em
                     join public.members m on m.id = em.member_id
                    where em.event_id = e.id
                 ), '[]'::jsonb) as osoby
            from public.events e
           where e.household_id = p_dom
             and e.starts_at < (p_dzien + 1)::timestamp
             and e.ends_at   > p_dzien::timestamp
        ) w
    ), '[]'::jsonb),

    -- Przypięte zawsze, reszta z ostatniej doby.
    'notatki', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.pinned desc, n.created_at desc)
        from (
          select nt.id, nt.content, nt.pinned, nt.created_at,
                 coalesce(a.name, 'ktoś') as autor
            from public.notes nt
            left join public.members a on a.id = nt.created_by
           where nt.household_id = p_dom
             and (nt.pinned or nt.created_at > now() - interval '24 hours')
        ) n
    ), '[]'::jsonb),

    -- Sama liczba nieodhaczonych. Pełna lista mleka i chleba o 7 rano to szum.
    'listy', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.name)
        from (
          select sl.id, sl.name,
                 (select count(*) from public.shopping_items si
                   where si.list_id = sl.id and not si.done) as pozostalo
            from public.shopping_lists sl
           where sl.household_id = p_dom
        ) l
       where l.pozostalo > 0
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.podsumowanie_domu(uuid, date) from public, anon, authenticated;
```

- [ ] **Krok 2: Sprawdź kształt na prawdziwym domu**

MCP `execute_sql` (podstaw dzisiejszą datę):

```sql
select jsonb_pretty(public.podsumowanie_domu(
  (select id from public.households limit 1),
  current_date));
```

Oczekiwane: obiekt z czterema kluczami; `wydarzenia`, `notatki` i `listy` są
tablicami (choćby pustymi), a nie `null`.

- [ ] **Krok 3: Sprawdź wydarzenie wielodniowe**

MCP `execute_sql`:

```sql
begin;
insert into public.events (title, starts_at, ends_at, all_day, household_id)
values ('Wakacje próbne', '2026-09-09 00:00:00', '2026-09-12 00:00:00', true,
        (select id from public.households limit 1));

select public.podsumowanie_domu((select id from public.households limit 1), '2026-09-10')
       -> 'wydarzenia' -> 0 ->> 'title';   -- oczekiwane: "Wakacje próbne"
select public.podsumowanie_domu((select id from public.households limit 1), '2026-09-12')
       -> 'wydarzenia';                     -- oczekiwane: [] (koniec wyłączny)
rollback;
```

- [ ] **Krok 4: Dopisz sekcję 16 do `supabase/schema.sql` i zacommituj**

```bash
git add supabase/schema.sql
git commit -m "Dane porannego podsumowania"
```

---

### Zadanie 4: Składanie treści maila

**Pliki:**
- Utworzenie: `supabase/functions/_wspolne/podsumowanie.ts`
- Test: `supabase/functions/_wspolne/podsumowanie.test.ts`

**Interfejsy:**
- Konsumuje: kształt JSON z `podsumowanie_domu` (zadanie 3).
- Produkuje:
  - typy `DanePodsumowania`, `WydarzenieDnia`, `NotatkaDnia`, `ListaDnia`, `Odbiorca`, `Mail`
  - `zbudujPodsumowanie(dane: DanePodsumowania, odbiorca: Odbiorca, opcje?: { linkAplikacji?: string }): Mail`
  - pomocnicze, eksportowane dla testów: `odmienWydarzenia(n: number): string`,
    `naglowekDnia(dzien: string): string`, `temat(dane: DanePodsumowania): string`,
    `liniaWydarzenia(w: WydarzenieDnia): string`

- [ ] **Krok 1: Testy tematu i odmiany — napisz je najpierw**

Utwórz `supabase/functions/_wspolne/podsumowanie.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { naglowekDnia, odmienWydarzenia, temat } from './podsumowanie'

function dane(ile: number) {
  return {
    dzien: '2026-09-09',
    wydarzenia: Array.from({ length: ile }, (_, i) => ({
      id: `w${i}`,
      title: `Wydarzenie ${i}`,
      starts_at: '2026-09-09T08:00:00',
      ends_at: '2026-09-09T09:00:00',
      all_day: false,
      osoby: [],
    })),
    notatki: [],
    listy: [],
  }
}

describe('odmienWydarzenia', () => {
  it('liczba pojedyncza', () => {
    expect(odmienWydarzenia(1)).toBe('1 wydarzenie')
  })

  it('dwa do czterech', () => {
    expect(odmienWydarzenia(3)).toBe('3 wydarzenia')
    expect(odmienWydarzenia(22)).toBe('22 wydarzenia')
  })

  it('pięć i więcej', () => {
    expect(odmienWydarzenia(5)).toBe('5 wydarzeń')
    expect(odmienWydarzenia(11)).toBe('11 wydarzeń')
  })

  it('nastki są wyjątkiem, mimo końcówki 2-4', () => {
    expect(odmienWydarzenia(13)).toBe('13 wydarzeń')
  })
})

describe('naglowekDnia', () => {
  it('nazwa dnia z wielkiej litery, potem data', () => {
    expect(naglowekDnia('2026-09-09')).toBe('Środa, 9 września')
  })
})

describe('temat', () => {
  it('liczy wydarzenia', () => {
    expect(temat(dane(3))).toBe('Środa, 9 września — 3 wydarzenia')
  })

  it('pusty dzień nazywa po imieniu', () => {
    expect(temat(dane(0))).toBe('Środa, 9 września — spokojny dzień')
  })
})
```

- [ ] **Krok 2: Uruchom testy i upewnij się, że padają**

```bash
npm test -- podsumowanie
```

Oczekiwane: FAIL, `Failed to resolve import "./podsumowanie"`.

- [ ] **Krok 3: Napisz moduł w minimalnym zakresie**

Utwórz `supabase/functions/_wspolne/podsumowanie.ts`:

```ts
/**
 * Poranne podsumowanie: z danych domu robi temat, tekst i HTML maila.
 *
 * Ten plik nie importuje NICZEGO - ani z `src/`, ani z Deno. Dzięki temu
 * testuje się zwykłym vitestem i nadaje się do ponownego użycia przez przyszłego
 * bota na komunikatorze, który poczty nie wyśle, a treść musi mieć tę samą.
 */

/** Wydarzenie tak, jak zwraca je `podsumowanie_domu` w bazie. */
export type WydarzenieDnia = {
  id: string
  title: string
  starts_at: string // 'RRRR-MM-DDTGG:MM:SS', bez strefy
  ends_at: string
  all_day: boolean
  osoby: { id: string; name: string }[]
}

export type NotatkaDnia = { id: string; content: string; pinned: boolean; autor: string }
export type ListaDnia = { id: string; name: string; pozostalo: number }

export type DanePodsumowania = {
  dzien: string // 'RRRR-MM-DD'
  wydarzenia: WydarzenieDnia[]
  notatki: NotatkaDnia[]
  listy: ListaDnia[]
}

/** Do kogo piszemy - `memberId` służy wyróżnieniu jego własnych wydarzeń. */
export type Odbiorca = { memberId: string; imie: string; email: string }

export type Mail = { temat: string; html: string; tekst: string }

/** „1 wydarzenie", „3 wydarzenia", „5 wydarzeń" - polska odmiana przez liczbę. */
export function odmienWydarzenia(n: number): string {
  if (n === 1) return '1 wydarzenie'
  const koncowka = n % 10
  const nastka = n % 100 >= 12 && n % 100 <= 14
  return `${n} ${koncowka >= 2 && koncowka <= 4 && !nastka ? 'wydarzenia' : 'wydarzeń'}`
}

/**
 * „Środa, 9 września". Datę czytamy w południe, bo o północy strefa serwera
 * (w Deno to UTC) potrafi cofnąć dzień o jeden.
 */
export function naglowekDnia(dzien: string): string {
  const d = new Date(`${dzien}T12:00:00`)
  const opis = d.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return opis.charAt(0).toUpperCase() + opis.slice(1)
}

export function temat(dane: DanePodsumowania): string {
  const ile = dane.wydarzenia.length
  return `${naglowekDnia(dane.dzien)} — ${ile === 0 ? 'spokojny dzień' : odmienWydarzenia(ile)}`
}
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm test -- podsumowanie
```

Oczekiwane: PASS, 7 testów.

- [ ] **Krok 5: Commit**

```bash
git add supabase/functions/_wspolne/podsumowanie.ts supabase/functions/_wspolne/podsumowanie.test.ts
git commit -m "Temat porannego podsumowania"
```

- [ ] **Krok 6: Testy pojedynczych linii — dopisz do pliku testów**

Rozszerz **istniejący import** na górze pliku:

```ts
import {
  liniaListy,
  liniaNotatki,
  liniaWydarzenia,
  naglowekDnia,
  odmienWydarzenia,
  temat,
} from './podsumowanie'
```

i dopisz na końcu pliku:

```ts
describe('liniaWydarzenia', () => {
  it('godzinowe: godzina, tytuł, osoby', () => {
    expect(
      liniaWydarzenia({
        id: 'a',
        title: 'Trening',
        starts_at: '2026-09-09T08:00:00',
        ends_at: '2026-09-09T09:30:00',
        all_day: false,
        osoby: [
          { id: 'o1', name: 'Ola' },
          { id: 'o2', name: 'Marek' },
        ],
      }),
    ).toBe('8:00 Trening — Ola, Marek')
  })

  it('całodniowe zamiast godziny mówi "Cały dzień"', () => {
    expect(
      liniaWydarzenia({
        id: 'b',
        title: 'Wakacje',
        starts_at: '2026-09-09T00:00:00',
        ends_at: '2026-09-12T00:00:00',
        all_day: true,
        osoby: [],
      }),
    ).toBe('Cały dzień · Wakacje')
  })

  it('bez osób nie dokleja myślnika', () => {
    expect(
      liniaWydarzenia({
        id: 'c',
        title: 'Dentysta',
        starts_at: '2026-09-09T14:05:00',
        ends_at: '2026-09-09T15:00:00',
        all_day: false,
        osoby: [],
      }),
    ).toBe('14:05 Dentysta')
  })
})

describe('liniaNotatki', () => {
  it('przypięta jest oznaczona', () => {
    expect(liniaNotatki({ id: 'n', content: 'Zebranie', pinned: true, autor: 'Marek' })).toBe(
      'Zebranie (przypięte, Marek)',
    )
  })

  it('zwykła podaje samego autora', () => {
    expect(liniaNotatki({ id: 'n', content: 'Kupiłem chleb', pinned: false, autor: 'Ola' })).toBe(
      'Kupiłem chleb (Ola)',
    )
  })
})

describe('liniaListy', () => {
  it('jedna rzecz', () => {
    expect(liniaListy({ id: 'l', name: 'Apteka', pozostalo: 1 })).toBe('Apteka — 1 rzecz')
  })

  it('więcej rzeczy', () => {
    expect(liniaListy({ id: 'l', name: 'Spożywcze', pozostalo: 4 })).toBe('Spożywcze — 4 rzeczy')
  })
})
```

- [ ] **Krok 7: Uruchom testy i upewnij się, że padają**

```bash
npm test -- podsumowanie
```

Oczekiwane: FAIL — `liniaWydarzenia is not a function` (i dwie podobne).

- [ ] **Krok 8: Dopisz te trzy funkcje do modułu**

Dopisz na końcu `podsumowanie.ts`:

```ts
/**
 * Godzina z kolumny `timestamp`, bez zera wiodącego: '08:00:00' -> '8:00'.
 * Bierzemy podciąg zamiast `new Date(...)`, bo wartość nie niesie strefy,
 * a Date doklejałby strefę serwera i przesuwał godziny.
 */
function godzina(ts: string): string {
  const hhmm = ts.slice(11, 16)
  return hhmm.startsWith('0') ? hhmm.slice(1) : hhmm
}

export function liniaWydarzenia(w: WydarzenieDnia): string {
  const czas = w.all_day ? 'Cały dzień ·' : godzina(w.starts_at)
  const osoby = w.osoby.length ? ` — ${w.osoby.map((o) => o.name).join(', ')}` : ''
  return `${czas} ${w.title}${osoby}`
}

export function liniaNotatki(n: NotatkaDnia): string {
  return `${n.content} (${n.pinned ? 'przypięte, ' : ''}${n.autor})`
}

export function liniaListy(l: ListaDnia): string {
  return `${l.name} — ${l.pozostalo} ${l.pozostalo === 1 ? 'rzecz' : 'rzeczy'}`
}
```

- [ ] **Krok 9: Uruchom testy — mają przejść**

```bash
npm test -- podsumowanie
```

Oczekiwane: PASS, 14 testów.

- [ ] **Krok 10: Commit**

```bash
git add supabase/functions/_wspolne/podsumowanie.ts supabase/functions/_wspolne/podsumowanie.test.ts
git commit -m "Linie wydarzen, notatek i list w podsumowaniu"
```

- [ ] **Krok 11: Testy całego maila — dopisz do pliku testów**

Znów rozszerz import na górze pliku o `zbudujPodsumowanie` i
`type DanePodsumowania`, a na końcu pliku dopisz:

```ts
const ODBIORCA = { memberId: 'ja', imie: 'Ola', email: 'ola@dom.pl' }

const PELNE: DanePodsumowania = {
  dzien: '2026-09-09',
  // Kolejność jak z bazy: całodniowe przed godzinowym.
  wydarzenia: [
    {
      id: 'w2',
      title: 'Wakacje',
      starts_at: '2026-09-09T00:00:00',
      ends_at: '2026-09-12T00:00:00',
      all_day: true,
      osoby: [{ id: 'inny', name: 'Kuba' }],
    },
    {
      id: 'w1',
      title: 'Trening',
      starts_at: '2026-09-09T18:00:00',
      ends_at: '2026-09-09T19:00:00',
      all_day: false,
      osoby: [{ id: 'ja', name: 'Ola' }],
    },
  ],
  notatki: [{ id: 'n1', content: 'Zebranie', pinned: true, autor: 'Marek' }],
  listy: [{ id: 'l1', name: 'Spożywcze', pozostalo: 4 }],
}

const PUSTE: DanePodsumowania = {
  dzien: '2026-09-09',
  wydarzenia: [],
  notatki: [],
  listy: [],
}

describe('zbudujPodsumowanie', () => {
  it('zachowuje kolejność, w jakiej dane przyszły z bazy', () => {
    const { tekst } = zbudujPodsumowanie(PELNE, ODBIORCA)
    expect(tekst.indexOf('Wakacje')).toBeLessThan(tekst.indexOf('Trening'))
  })

  it('wydarzenie odbiorcy jest wyróżnione gwiazdką', () => {
    const { tekst } = zbudujPodsumowanie(PELNE, ODBIORCA)
    expect(tekst).toContain('* 18:00 Trening — Ola')
    expect(tekst).toContain('  Cały dzień · Wakacje — Kuba')
  })

  it('ma wszystkie trzy sekcje, gdy jest czym je wypełnić', () => {
    const { tekst } = zbudujPodsumowanie(PELNE, ODBIORCA)
    expect(tekst).toContain('DZIŚ W KALENDARZU')
    expect(tekst).toContain('TABLICA')
    expect(tekst).toContain('ZAKUPY')
  })

  it('pomija sekcję, dla której nie ma treści', () => {
    const { tekst } = zbudujPodsumowanie({ ...PELNE, listy: [] }, ODBIORCA)
    expect(tekst).not.toContain('ZAKUPY')
  })

  it('pusty dzień to jedno zdanie, bez nagłówków sekcji', () => {
    const { tekst, temat } = zbudujPodsumowanie(PUSTE, ODBIORCA)
    expect(temat).toContain('spokojny dzień')
    expect(tekst).toContain('Spokojny dzień')
    expect(tekst).not.toContain('DZIŚ W KALENDARZU')
  })

  it('zwraca się do odbiorcy po imieniu', () => {
    expect(zbudujPodsumowanie(PUSTE, ODBIORCA).tekst).toContain('Dzień dobry, Ola!')
  })

  it('stopka mówi, gdzie to wyłączyć', () => {
    expect(zbudujPodsumowanie(PUSTE, ODBIORCA).tekst).toContain('Mój dom')
  })

  it('link pojawia się tylko wtedy, gdy jest dokąd prowadzić', () => {
    expect(zbudujPodsumowanie(PUSTE, ODBIORCA).html).not.toContain('<a ')
    expect(
      zbudujPodsumowanie(PUSTE, ODBIORCA, { linkAplikacji: 'https://kokpit.example' }).html,
    ).toContain('https://kokpit.example')
  })

  it('HTML ma style w atrybutach, bo klienci pocztowi nie czytają <style>', () => {
    const { html } = zbudujPodsumowanie(PELNE, ODBIORCA)
    expect(html).toContain('style="')
    expect(html).not.toContain('<style')
  })

  it('escapuje treść z bazy, żeby notatka nie wstrzyknęła znaczników', () => {
    const zlosliwa = {
      ...PUSTE,
      notatki: [{ id: 'n', content: '<b>hej</b>', pinned: false, autor: 'Ola' }],
    }
    expect(zbudujPodsumowanie(zlosliwa, ODBIORCA).html).toContain('&lt;b&gt;hej&lt;/b&gt;')
  })
})
```

- [ ] **Krok 12: Uruchom testy i upewnij się, że padają**

```bash
npm test -- podsumowanie
```

Oczekiwane: FAIL — `zbudujPodsumowanie is not a function`.

- [ ] **Krok 13: Dopisz złożenie całości**

Dopisz na końcu `podsumowanie.ts`:

```ts
/** Wydarzenia odbiorcy na wierzchu wzroku - mail idzie do konkretnej osoby. */
function moje(w: WydarzenieDnia, memberId: string): boolean {
  return w.osoby.some((o) => o.id === memberId)
}

function escapuj(tekst: string): string {
  return tekst
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type Sekcja = { tytul: string; linie: { tresc: string; wyroznione: boolean }[] }

function sekcje(dane: DanePodsumowania, memberId: string): Sekcja[] {
  const wynik: Sekcja[] = []

  if (dane.wydarzenia.length) {
    wynik.push({
      tytul: 'DZIŚ W KALENDARZU',
      linie: dane.wydarzenia.map((w) => ({
        tresc: liniaWydarzenia(w),
        wyroznione: moje(w, memberId),
      })),
    })
  }

  if (dane.notatki.length) {
    wynik.push({
      tytul: 'TABLICA',
      linie: dane.notatki.map((n) => ({ tresc: liniaNotatki(n), wyroznione: false })),
    })
  }

  if (dane.listy.length) {
    wynik.push({
      tytul: 'ZAKUPY',
      linie: dane.listy.map((l) => ({ tresc: liniaListy(l), wyroznione: false })),
    })
  }

  return wynik
}

const SPOKOJNY =
  'Spokojny dzień — nic w kalendarzu, nic nowego na tablicy, listy zakupów odhaczone.'
const STOPKA = 'Wyłączysz to w Kokpicie → Mój dom.'

/**
 * Cały mail: temat, wersja tekstowa i HTML. Kolejność wydarzeń przychodzi
 * z bazy (całodniowe pierwsze) - tu jej nie zmieniamy.
 */
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

- [ ] **Krok 14: Uruchom pełne testy i lint**

```bash
npm test
npm run lint
```

Oczekiwane: wszystkie testy PASS (72 dotychczasowe + 24 nowe = 96), lint bez uwag.

- [ ] **Krok 15: Commit**

```bash
git add supabase/functions/_wspolne/podsumowanie.ts supabase/functions/_wspolne/podsumowanie.test.ts
git commit -m "Skladanie tresci porannego maila"
```

---

### Zadanie 5: Wysyłka i Edge Function

**Pliki:**
- Utworzenie: `supabase/functions/_wspolne/resend.ts`
- Utworzenie: `supabase/functions/poranne-podsumowanie/index.ts`

**Interfejsy:**
- Konsumuje: `do_wyslania`, `podsumowanie_domu`, `zamknij_wysylke` (zadania 2–3),
  `zbudujPodsumowanie` (zadanie 4).
- Produkuje: `wyslij(w: Wiadomosc): Promise<void>` oraz wdrożoną funkcję
  `poranne-podsumowanie`, odpowiadającą `{"wyslane": n, "bledy": n}`.

- [ ] **Krok 1: Załóż konto Resend i klucz** *(krok dla człowieka)*

1. [resend.com](https://resend.com) → załóż konto (darmowy plan: 100 maili/dzień).
2. **API Keys** → *Create API Key*, uprawnienie *Sending access*. Skopiuj klucz
   `re_…` — pokazuje się raz.
3. Bez zweryfikowanej domeny Resend wyśle **tylko na adres właściciela konta**.
   Nadawcą jest wtedy `onboarding@resend.dev`.

- [ ] **Krok 2: Ustaw sekrety funkcji** *(krok dla człowieka)*

Panel Supabase → **Edge Functions** → **Secrets** → dodaj trzy:

| Nazwa | Wartość |
| --- | --- |
| `RESEND_API_KEY` | klucz `re_…` z kroku 1 |
| `RESEND_FROM` | `Kokpit Rodzinny <onboarding@resend.dev>` |
| `APP_URL` | adres aplikacji albo pusto, jeśli jeszcze nie jest nigdzie wdrożona |

`SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` są wstrzykiwane automatycznie — nie
dodawaj ich ręcznie.

- [ ] **Krok 3: Napisz moduł wysyłki**

Utwórz `supabase/functions/_wspolne/resend.ts`:

```ts
/**
 * Jedyne miejsce w aplikacji, które wie o dostawcy poczty. Zmiana Resenda na
 * cokolwiek innego to zmiana tego pliku i niczego więcej.
 */

export type Wiadomosc = { do: string; temat: string; html: string; tekst: string }

export async function wyslij(w: Wiadomosc): Promise<void> {
  const klucz = Deno.env.get('RESEND_API_KEY')
  const od = Deno.env.get('RESEND_FROM')

  if (!klucz || !od) {
    throw new Error('Brakuje sekretu RESEND_API_KEY albo RESEND_FROM.')
  }

  const odpowiedz = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${klucz}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: od,
      to: [w.do],
      subject: w.temat,
      html: w.html,
      text: w.tekst,
    }),
  })

  if (!odpowiedz.ok) {
    // Treść błędu trafia do `digest_log.error`, więc obcinamy ją do rozsądnej
    // długości - inaczej stron HTML-a z proxy zaśmieciłaby dziennik.
    const tresc = (await odpowiedz.text()).slice(0, 300)
    throw new Error(`Resend ${odpowiedz.status}: ${tresc}`)
  }
}
```

- [ ] **Krok 4: Napisz funkcję**

Utwórz `supabase/functions/poranne-podsumowanie/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { zbudujPodsumowanie, type DanePodsumowania } from '../_wspolne/podsumowanie.ts'
import { wyslij } from '../_wspolne/resend.ts'

/**
 * Jeden wiersz z `do_wyslania` - odbiorca już zajęty w dzienniku. Nazwa inna
 * niż `Odbiorca` z `podsumowanie.ts`, bo to co innego: tam adresat treści,
 * tu zadanie do wykonania.
 */
type Zajety = {
  log_id: string
  id_domownika: string
  id_domu: string
  adres: string
  imie: string
  dzien: string
}

Deno.serve(async () => {
  const baza = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data, error } = await baza.rpc('do_wyslania')
  if (error) {
    return odpowiedz({ blad: error.message }, 500)
  }

  const odbiorcy = (data ?? []) as Zajety[]
  if (odbiorcy.length === 0) {
    return odpowiedz({ wyslane: 0, bledy: 0 })
  }

  // Trzech domowników pod jednym adresem to jedno zapytanie o dane, nie trzy.
  const podsumowania = new Map<string, DanePodsumowania>()
  const link = Deno.env.get('APP_URL') ?? ''
  let wyslane = 0
  let bledy = 0

  for (const o of odbiorcy) {
    try {
      let dane = podsumowania.get(o.id_domu)
      if (!dane) {
        const wynik = await baza.rpc('podsumowanie_domu', {
          p_dom: o.id_domu,
          p_dzien: o.dzien,
        })
        if (wynik.error) throw new Error(wynik.error.message)
        dane = wynik.data as DanePodsumowania
        podsumowania.set(o.id_domu, dane)
      }

      const mail = zbudujPodsumowanie(
        dane,
        { memberId: o.id_domownika, imie: o.imie, email: o.adres },
        { linkAplikacji: link },
      )

      await wyslij({ do: o.adres, temat: mail.temat, html: mail.html, tekst: mail.tekst })
      await baza.rpc('zamknij_wysylke', { p_log: o.log_id })
      wyslane++
    } catch (e) {
      // Porażka jednej osoby nie może zatrzymać reszty domu.
      await baza.rpc('zamknij_wysylke', {
        p_log: o.log_id,
        p_blad: String(e instanceof Error ? e.message : e).slice(0, 500),
      })
      bledy++
    }
  }

  return odpowiedz({ wyslane, bledy })
})

function odpowiedz(tresc: unknown, status = 200): Response {
  return new Response(JSON.stringify(tresc), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Krok 5: Wdróż funkcję**

MCP `deploy_edge_function`, nazwa `poranne-podsumowanie`, pliki:
`supabase/functions/poranne-podsumowanie/index.ts` (entrypoint) oraz
`supabase/functions/_wspolne/podsumowanie.ts` i `supabase/functions/_wspolne/resend.ts`.

Potem MCP `list_edge_functions` — funkcja ma być na liście ze statusem `ACTIVE`.

- [ ] **Krok 6: Ustaw sobie wysyłkę na teraz**

MCP `execute_sql` — podstaw **adres właściciela konta Resend** i godzinę, która
właśnie minęła w Polsce (np. jest 14:20 → wpisz `14:00`):

```sql
update public.members
   set digest_enabled = true, digest_at = '14:00'
 where email = '<TWOJ_ADRES>'
returning id, name, email, digest_at;
```

- [ ] **Krok 7: Wywołaj funkcję** *(krok dla człowieka — potrzebny klucz serwisowy)*

Panel Supabase → **Settings → API** → skopiuj `service_role`. Potem:

```bash
curl -X POST \
  "https://fqviwnzinpndyprcovxw.supabase.co/functions/v1/poranne-podsumowanie" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

Oczekiwane: `{"wyslane":1,"bledy":0}` i mail w skrzynce.

- [ ] **Krok 8: Sprawdź dziennik**

MCP `execute_sql`:

```sql
select m.name, d.sent_for, d.status, d.attempts, d.error, d.sent_at
  from public.digest_log d join public.members m on m.id = d.member_id
 order by d.claimed_at desc limit 5;
```

Oczekiwane: `status = 'wyslane'`, `error` puste, `sent_at` wypełnione.

Jeśli `status = 'blad'` — treść w kolumnie `error` mówi, co odrzucił Resend
(najczęściej: wysyłka na cudzy adres bez zweryfikowanej domeny).

- [ ] **Krok 9: Sprawdź, że drugie wywołanie nie wyśle drugi raz**

Powtórz curl z kroku 7. Oczekiwane: `{"wyslane":0,"bledy":0}`.

- [ ] **Krok 10: Commit**

```bash
git add supabase/functions
git commit -m "Edge Function wysylajaca poranne podsumowanie"
```

---

### Zadanie 6: Harmonogram

**Pliki:**
- Modyfikacja: `supabase/schema.sql` (sekcja 17)
- Migracja: `powiadomienia_cron`

**Interfejsy:**
- Konsumuje: wdrożoną funkcję `poranne-podsumowanie` (zadanie 5).
- Produkuje: zadanie `cron.job` o nazwie `poranne-podsumowanie`, `*/15 * * * *`.

- [ ] **Krok 1: Wpisz sekrety do Vault**

MCP `execute_sql` — podstaw klucz `service_role`:

```sql
select vault.create_secret(
  'https://fqviwnzinpndyprcovxw.supabase.co/functions/v1/poranne-podsumowanie',
  'kokpit_url_funkcji');

select vault.create_secret('<SERVICE_ROLE_KEY>', 'kokpit_klucz_serwisowy');
```

Klucz idzie do Vault, a nie do treści zadania cron, bo `cron.job` przeczyta
każdy, kto ma dostęp do bazy.

- [ ] **Krok 2: Włącz rozszerzenia i zaplanuj zadanie**

MCP `apply_migration`, nazwa `powiadomienia_cron`:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Co 15 minut, przy godzinach wybieranych co 30 - zapas na spóźniony przebieg.
-- Dziennie 96 wywołań, w większości kończących się pustym `do_wyslania()`.
select cron.schedule('poranne-podsumowanie', '*/15 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets
                 where name = 'kokpit_url_funkcji'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' ||
                   (select decrypted_secret from vault.decrypted_secrets
                     where name = 'kokpit_klucz_serwisowy')),
    body    := '{}'::jsonb
  );
$$);
```

- [ ] **Krok 3: Sprawdź, że zadanie istnieje i jest aktywne**

MCP `execute_sql`:

```sql
select jobname, schedule, active from cron.job where jobname = 'poranne-podsumowanie';
```

Oczekiwane: jeden wiersz, `*/15 * * * *`, `active = true`.

- [ ] **Krok 4: Poczekaj na najbliższy kwadrans i sprawdź przebieg**

MCP `execute_sql`:

```sql
select status, return_message, start_time
  from cron.job_run_details
 where jobname = 'poranne-podsumowanie'
 order by start_time desc limit 3;
```

Oczekiwane: `status = 'succeeded'`. To potwierdza, że **zadanie się wykonało** —
czy funkcja odpowiedziała, mówi dopiero krok 5.

- [ ] **Krok 5: Sprawdź odpowiedź HTTP**

MCP `execute_sql`:

```sql
select status_code, content::text, created
  from net._http_response
 order by created desc limit 3;
```

Oczekiwane: `200` i treść `{"wyslane":0,"bledy":0}` (0, bo dzisiejszy mail już
poszedł w zadaniu 5).

- [ ] **Krok 6: Dopisz sekcję 17 do `supabase/schema.sql`**

Ten sam SQL co w kroku 2, z komentarzem nad `create extension`, że sekrety Vault
trzeba założyć ręcznie (krok 1) — bo klucz serwisowy nie może trafić do repo.

- [ ] **Krok 7: Commit**

```bash
git add supabase/schema.sql
git commit -m "Harmonogram porannego podsumowania"
```

---

### Zadanie 7: Ekran ustawień w „Mój dom"

**Pliki:**
- Modyfikacja: `src/lib/supabase.ts` (typ `DomownikDb`)
- Modyfikacja: `src/useDomownicy.ts`
- Modyfikacja: `src/MojDom.tsx`
- Modyfikacja: `src/App.tsx:213-222`
- Modyfikacja: `src/App.css`

**Interfejsy:**
- Konsumuje: `ustaw_powiadomienia(p_wlaczone, p_godzina)` z zadania 1.
- Produkuje: `useDomownicy().ustawPowiadomienia(wlaczone: boolean, godzina: string): Promise<boolean>`,
  gdzie `godzina` ma postać `'GG:MM'`.

- [ ] **Krok 1: Dopisz pola do typu**

W `src/lib/supabase.ts`, w typie `DomownikDb`, po `created_at`:

```ts
  /** Czy ta osoba chce porannego podsumowania mailem. */
  digest_enabled: boolean
  /** O której, czasu polskiego. Format kolumny `time`: 'GG:MM:SS'. */
  digest_at: string
```

- [ ] **Krok 2: Dodaj operację do hooka**

W `src/useDomownicy.ts`, po funkcji `zmien`, dopisz:

```ts
  /**
   * Własne powiadomienia. Idzie przez funkcję w bazie, nie przez update na
   * `members` - polityka pozwala zmieniać wiersze tylko rodzicowi, a luzowanie
   * jej dałoby dziecku prawo przestawić sobie rolę. RLS filtruje wiersze, nie
   * kolumny.
   */
  const ustawPowiadomienia = useCallback(
    async (wlaczone: boolean, godzina: string): Promise<boolean> => {
      const { error } = await supabase.rpc('ustaw_powiadomienia', {
        p_wlaczone: wlaczone,
        p_godzina: godzina,
      })

      if (error) {
        onBlad(`Nie udało się zapisać powiadomień: ${error.message}`)
        return false
      }

      await odswiez()
      return true
    },
    [odswiez, onBlad],
  )
```

i dopisz `ustawPowiadomienia` do zwracanego obiektu:

```ts
  return { domownicy, ladowanie, dodaj, zmien, usun, proponowanyKolor, ustawPowiadomienia }
```

- [ ] **Krok 3: Dodaj sekcję na ekranie**

W `src/MojDom.tsx`:

Na górze pliku, obok `const ROLE`, dopisz listę godzin:

```ts
/** Od 5:00 do 10:00 co pół godziny - poza tym oknem "poranne" traci sens. */
const GODZINY = Array.from({ length: 11 }, (_, i) => {
  const minuty = 5 * 60 + i * 30
  return `${String(Math.floor(minuty / 60)).padStart(2, '0')}:${minuty % 60 === 0 ? '00' : '30'}`
})
```

Do typu `Props` dopisz:

```ts
  onUstawPowiadomienia: (wlaczone: boolean, godzina: string) => Promise<boolean>
```

Do listy parametrów komponentu `MojDom` dopisz `onUstawPowiadomienia`, a przed
sekcją „Dodaj domownika" wstaw:

```tsx
      <Powiadomienia
        ja={domownicy.find((d) => d.id === mojeId)}
        onZapisz={onUstawPowiadomienia}
      />
```

Na końcu pliku dopisz komponent:

```tsx
/**
 * Ustawienia porannego maila - wyłącznie własne. Cudzych powiadomień nie
 * ustawia nikt, rodzic też nie: to skrzynka tej osoby.
 */
function Powiadomienia({
  ja,
  onZapisz,
}: {
  ja: DomownikDb | undefined
  onZapisz: (wlaczone: boolean, godzina: string) => Promise<boolean>
}) {
  const [zapisywanie, setZapisywanie] = useState(false)

  if (!ja) return null

  const godzina = ja.digest_at.slice(0, 5)

  async function zapisz(wlaczone: boolean, oGodzinie: string) {
    setZapisywanie(true)
    await onZapisz(wlaczone, oGodzinie)
    setZapisywanie(false)
  }

  return (
    <section className="karta">
      <h2 className="panel-tytul">Powiadomienia</h2>
      <p className="panel-dzien">
        Poranny mail z tym, co dziś czeka dom: kalendarz, świeże ogłoszenia
        z tablicy i to, czego brakuje na listach zakupów.
      </p>

      <div className="powiadomienia">
        <label className="przelacznik">
          <input
            type="checkbox"
            checked={ja.digest_enabled}
            disabled={zapisywanie}
            onChange={(e) => void zapisz(e.target.checked, godzina)}
          />
          Poranne podsumowanie
        </label>

        <label htmlFor="godzina-podsumowania">O godzinie</label>
        <select
          id="godzina-podsumowania"
          value={godzina}
          disabled={zapisywanie || !ja.digest_enabled}
          onChange={(e) => void zapisz(true, e.target.value)}
        >
          {GODZINY.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
```

- [ ] **Krok 4: Przekaż funkcję z `App.tsx`**

W `src/App.tsx`, w bloku `<MojDom … />` (linie 213-222), po `onUsun`:

```tsx
          onUstawPowiadomienia={osoby.ustawPowiadomienia}
```

- [ ] **Krok 5: Dodaj style**

Na końcu `src/App.css`:

```css
/* Ustawienia porannego maila - własne, więc bez listy osób. */
.powiadomienia {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px 12px;
  align-items: center;
}

.powiadomienia .przelacznik {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.powiadomienia select {
  justify-self: start;
}
```

- [ ] **Krok 6: Sprawdź w przeglądarce**

```bash
npm run dev
```

Wejdź na „Mój dom". Oczekiwane:

1. Sekcja „Powiadomienia" jest widoczna, przełącznik odbija stan z bazy.
2. Wybór godziny jest nieaktywny, dopóki przełącznik jest wyłączony.
3. Zmiana godziny zapisuje się — po `F5` zostaje.
4. Sprawdź w MCP `execute_sql`, że zmienił się właściwy wiersz:

```sql
select name, digest_enabled, digest_at from public.members order by created_at;
```

- [ ] **Krok 7: Testy, lint i build**

```bash
npm test
npm run lint
npm run build
```

Oczekiwane: wszystko przechodzi.

- [ ] **Krok 8: Commit**

```bash
git add src
git commit -m "Ustawienia porannego podsumowania na ekranie Moj dom"
```

---

### Zadanie 8: README i próba końcowa

**Pliki:**
- Modyfikacja: `README.md`

- [ ] **Krok 1: Dodaj sekcję o funkcji**

W `README.md`, po sekcji „Podgląd na żywo", wstaw:

```markdown
## Poranne podsumowanie

Raz dziennie, o godzinie, którą każdy ustawia sobie sam, przychodzi mail z tym,
co dziś czeka dom: wydarzenia z kalendarza, przypięte i świeże ogłoszenia
z tablicy oraz liczba nieodhaczonych rzeczy na listach zakupów. Wydarzenia,
do których jesteś przypisany, są pogrubione.

Podsumowanie jest **domyślnie wyłączone** — włącznik i godzinę znajdziesz na
ekranie „Mój dom". Ustawia je każdy sobie, rodzic też nie zrobi tego za innych:
to skrzynka tej osoby. Dostają je wyłącznie domownicy z kontem.

Pusty dzień też dostaje maila — jedno zdanie. Dzięki temu cisza w skrzynce
znaczy awarię, a nie „nic się nie dzieje".

Wysyłkę uruchamia `pg_cron` co 15 minut. Zadanie woła Edge Function
`poranne-podsumowanie`, ta wybiera domowników, którym właśnie wybiła ich
godzina, i zapisuje każdą wysyłkę w tabeli `digest_log` — jeden mail na osobę
na dzień, niezależnie od tego, ile razy cron się odpali.
```

- [ ] **Krok 1a: Dodaj punkt do konfiguracji**

W sekcji „Konfiguracja bazy", po punkcie 4, wstaw:

```markdown
5. **Poranne podsumowanie** (opcjonalne — bez tego reszta aplikacji działa):

   - Załóż konto na [resend.com](https://resend.com) i wygeneruj klucz API.
   - Panel Supabase → **Edge Functions → Secrets**: `RESEND_API_KEY` (klucz
     `re_…`), `RESEND_FROM` (np. `Kokpit Rodzinny <onboarding@resend.dev>`),
     `APP_URL` (adres aplikacji albo pusto).
   - SQL Editor: załóż sekrety Vault, podstawiając klucz `service_role`
     z **Settings → API**:

     ```sql
     select vault.create_secret(
       'https://TWOJ-PROJEKT.supabase.co/functions/v1/poranne-podsumowanie',
       'kokpit_url_funkcji');
     select vault.create_secret('SERVICE_ROLE_KEY', 'kokpit_klucz_serwisowy');
     ```

   - Wdróż funkcję: `supabase functions deploy poranne-podsumowanie`.

   Dopóki nie zweryfikujesz własnej domeny w Resend, maile dochodzą **wyłącznie
   na adres właściciela konta Resend** — pozostali domownicy nie dostaną nic.
```

- [ ] **Krok 1b: Uzupełnij tabelę „Struktura"**

Dopisz trzy wiersze, przed wierszem `supabase/schema.sql`:

| Plik | Do czego służy |
| --- | --- |
| `supabase/functions/poranne-podsumowanie/index.ts` | Spina bazę, treść i wysyłkę |
| `supabase/functions/_wspolne/podsumowanie.ts` | Temat i treść maila z danych domu |
| `supabase/functions/_wspolne/resend.ts` | Wysyłka — jedyne miejsce z dostawcą poczty |

- [ ] **Krok 2: Próba końcowa na żywo**

1. W „Mój dom" ustaw sobie godzinę na najbliższy pełny kwadrans wstecz.
2. MCP `execute_sql`: `delete from public.digest_log where sent_for = current_date;`
3. Poczekaj na przebieg crona (do 15 minut).
4. Sprawdź skrzynkę i dziennik:

```sql
select m.name, d.status, d.error, d.sent_at
  from public.digest_log d join public.members m on m.id = d.member_id
 where d.sent_for = current_date;
```

Oczekiwane: mail w skrzynce, `status = 'wyslane'`.

- [ ] **Krok 3: Sprawdź treść maila**

W mailu ma się zgadzać: nazwa dnia w temacie, liczba wydarzeń, Twoje wydarzenia
pogrubione, brak pustych sekcji, stopka „Wyłączysz to w Kokpicie → Mój dom".

- [ ] **Krok 4: Commit**

```bash
git add README.md
git commit -m "README: poranne podsumowanie mailem"
```

---

## Kolejność i zależności

```
1 (ustawienia) ─┐
                ├─> 2 (dziennik) ─┐
                │                 ├─> 5 (Edge Function) ─> 6 (cron) ─> 8 (README)
                └─> 3 (dane) ─────┤
                     4 (treść) ───┘
7 (ekran) zależy tylko od 1 - można je zrobić w dowolnym momencie po zadaniu 1.
```

Zadania 5, 6 i 8 mają kroki, których nie da się wykonać z poziomu MCP: klucz
Resend, sekrety Edge Function i klucz `service_role` musi wprowadzić człowiek.
