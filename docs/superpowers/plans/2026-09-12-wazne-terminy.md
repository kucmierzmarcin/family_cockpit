# Ważne terminy — plan wdrożenia

> **Dla agentów:** WYMAGANY SUB-SKILL: użyj `superpowers:subagent-driven-development`
> (zalecane) albo `superpowers:executing-plans`, żeby wykonać ten plan zadanie po
> zadaniu. Kroki mają checkboxy (`- [ ]`) do odhaczania.

**Cel:** Nowa zakładka „Terminy" — lista ważnych terminów (tytuł, opis, data)
z opcjonalnymi załącznikami (zdjęcia/PDF) trzymanymi w Supabase Storage, np.
„Ubezpieczenie auta — ważne do 2026-12-01" ze skanem polisy.

**Architektura:** Dwie tabele (`deadlines`, `deadline_attachments`) z RLS
wzorowanym na `notes`/`shopping_items` — cały dom widzi i dodaje, edytuje
(odhacza) każdy, usuwa autor albo rodzic. Pliki leżą w prywatnym buckecie
Supabase Storage `deadline-attachments`, ścieżka `{household_id}/{deadline_id}/…`,
polityki na `storage.objects` powtarzają ten sam podział uprawnień. Przeglądarka
łączy się z bazą i Storage bezpośrednio (klucz publishable + sesja
zalogowanego), bez żadnej Edge Function — dokładnie jak `Tablica`/`Zakupy`.

**Stack:** Supabase (Postgres, RLS, Storage), React 19 + TypeScript + Vite 8,
vitest 5.

**Spec:** [`docs/superpowers/specs/2026-09-12-wazne-terminy-design.md`](../specs/2026-09-12-wazne-terminy-design.md)

## Ograniczenia globalne

- Nazwy kolumn i tabel w bazie po angielsku, nazwy funkcji i polityk po
  polsku — tak jest w całym `supabase/schema.sql`.
- Każda zmiana schematu ląduje w **dwóch** miejscach: jako migracja w
  projekcie Supabase (MCP `apply_migration`) **i** dopisana do
  `supabase/schema.sql` (nowa sekcja 19).
- Nowe funkcje w bazie: `security definer set search_path = public`.
- `household_id`/`created_by` dostają `default public.moj_dom()` /
  `default public.ja_jako_member()` — kod TypeScript nigdy ich nie wysyła
  przy insercie, tak jak dziś `notes`/`shopping_items`.
- `due_date` to kolumna `date` — w TS/JS to zwykły string `'RRRR-MM-DD'`,
  bez żadnej konwersji przez `Date`/strefy czasowe (błąd tej klasy już raz
  kosztował sesję przy bocie na Telegramie — tu go unikamy, licząc "dzisiaj"
  przez `klucz(new Date())` z `src/dates.ts`, nie przez `toISOString()`).
- Załączniki: dozwolone typy `image/jpeg`, `image/png`, `image/webp`,
  `application/pdf` (ten sam zestaw co w `ImportAI.tsx`), limit 10 MB/plik —
  wymuszone i na buckecie Storage, i w `src/terminy.ts` przed uploadem.
- Projekt Supabase: ref `fqviwnzinpndyprcovxw`.
- Testy uruchamiamy `npm test`; lint `npm run lint`; build `npm run build`.
  Wszystkie muszą przechodzić przed każdym commitem, który dotyka `src/`.
- Commity po polsku, stopka `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## Struktura plików

| Plik | Rola |
| --- | --- |
| `supabase/schema.sql` | modyfikacja — sekcja 19: tabele, RLS, bucket Storage + polityki, publikacja Realtime |
| `src/terminy.ts` | nowy — typy, sortowanie, przeterminowanie, formatowanie daty, walidacja załącznika |
| `src/terminy.test.ts` | nowy — testy powyższego |
| `src/lib/supabase.ts` | modyfikacja — typy `TerminDb`, `ZalacznikDb` |
| `src/useTerminy.ts` | nowy — dane, Realtime, CRUD terminów i załączników (w tym upload/usuwanie w Storage) |
| `src/Terminy.tsx` | nowy — ekran „Terminy": lista, formularz, załączniki |
| `src/style/listy.css` | modyfikacja — style karty terminu |
| `src/style/powloka.css` | modyfikacja — naprawa sztywnej liczby kolumn dolnego paska (4 → dowolna) |
| `src/uklad/nawigacja.ts` | modyfikacja — piąty ekran `'terminy'` |
| `src/App.tsx` | modyfikacja — piąta zakładka, przekazanie `householdId` |
| `README.md` | modyfikacja — sekcja „Ważne terminy", wiersze w „Struktura" |

---

### Zadanie 1: Tabele `deadlines` i `deadline_attachments`

**Pliki:**
- Modyfikacja: `supabase/schema.sql` (dopisanie sekcji 19, część 1)
- Migracja: `wazne_terminy_tabele`

**Interfejsy:**
- Produkuje: tabele `deadlines(id, household_id, title, description, due_date,
  completed, completed_at, created_by, created_at)` i
  `deadline_attachments(id, deadline_id, storage_path, file_name,
  content_type, size_bytes, created_by, created_at)`; funkcje
  `termin_z_mojego_domu(uuid) returns boolean`, `moj_termin(uuid) returns
  boolean`, `moj_zalacznik(uuid) returns boolean`.

- [ ] **Krok 1: Sprawdź, że tabel jeszcze nie ma**

MCP `execute_sql`:

```sql
select to_regclass('public.deadlines');
select to_regclass('public.deadline_attachments');
```

Oczekiwane: `null` z obu.

- [ ] **Krok 2: Zastosuj migrację**

MCP `apply_migration`, nazwa `wazne_terminy_tabele`:

```sql
create table if not exists public.deadlines (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        references public.households(id) on delete cascade,
  title        text        not null,
  description  text,
  due_date     date        not null,
  completed    boolean     not null default false,
  completed_at timestamptz,
  created_by   uuid        references public.members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.deadline_attachments (
  id           uuid        primary key default gen_random_uuid(),
  deadline_id  uuid        not null references public.deadlines(id) on delete cascade,
  storage_path text        not null,
  file_name    text        not null,
  content_type text        not null,
  size_bytes   bigint      not null,
  created_by   uuid        references public.members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists deadlines_household_idx on public.deadlines (household_id);
create index if not exists deadline_attachments_deadline_idx on public.deadline_attachments (deadline_id);

alter table public.deadlines alter column household_id set default public.moj_dom();
alter table public.deadlines alter column created_by   set default public.ja_jako_member();
alter table public.deadline_attachments alter column created_by set default public.ja_jako_member();

-- Zalaczniki naleza do domu przez swoj termin - polityka musi siegnac poziom
-- wyzej. SECURITY DEFINER - ten sam wzorzec co przy shopping_items.
create or replace function public.termin_z_mojego_domu(p_termin uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.deadlines d
     where d.id = p_termin and d.household_id = public.moj_dom()
  )
$$;

create or replace function public.moj_termin(p_termin uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.deadlines d
     where d.id = p_termin and d.created_by = public.ja_jako_member()
  )
$$;

create or replace function public.moj_zalacznik(p_zalacznik uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.deadline_attachments a
     where a.id = p_zalacznik and a.created_by = public.ja_jako_member()
  )
$$;

grant execute on function public.termin_z_mojego_domu(uuid) to authenticated;
grant execute on function public.moj_termin(uuid)           to authenticated;
grant execute on function public.moj_zalacznik(uuid)        to authenticated;

alter table public.deadlines            enable row level security;
alter table public.deadline_attachments enable row level security;

-- Terminy: widzi i dodaje caly dom. Odhaczanie "zalatwione" to update -
-- wolno kazdemu, tak jak przypinanie notatki na tablicy. Usuwa autor albo rodzic.
drop policy if exists "Terminy - odczyt" on public.deadlines;
create policy "Terminy - odczyt" on public.deadlines
  for select to authenticated
  using (household_id = public.moj_dom());

drop policy if exists "Terminy - dodawanie" on public.deadlines;
create policy "Terminy - dodawanie" on public.deadlines
  for insert to authenticated
  with check (household_id = public.moj_dom());

drop policy if exists "Terminy - zmiana" on public.deadlines;
create policy "Terminy - zmiana" on public.deadlines
  for update to authenticated
  using (household_id = public.moj_dom())
  with check (household_id = public.moj_dom());

drop policy if exists "Terminy - usuwanie" on public.deadlines;
create policy "Terminy - usuwanie" on public.deadlines
  for delete to authenticated
  using (
    household_id = public.moj_dom()
    and (public.moj_termin(id) or public.jestem_rodzicem())
  );

-- Zalaczniki: dodaje kazdy z domu, usuwa wgrywajacy albo rodzic. Bez polityki
-- update - zalacznik sie nie zmienia, tylko dodaje/usuwa.
drop policy if exists "Zalaczniki terminow - odczyt" on public.deadline_attachments;
create policy "Zalaczniki terminow - odczyt" on public.deadline_attachments
  for select to authenticated
  using (public.termin_z_mojego_domu(deadline_id));

drop policy if exists "Zalaczniki terminow - dodawanie" on public.deadline_attachments;
create policy "Zalaczniki terminow - dodawanie" on public.deadline_attachments
  for insert to authenticated
  with check (public.termin_z_mojego_domu(deadline_id));

drop policy if exists "Zalaczniki terminow - usuwanie" on public.deadline_attachments;
create policy "Zalaczniki terminow - usuwanie" on public.deadline_attachments
  for delete to authenticated
  using (
    public.termin_z_mojego_domu(deadline_id)
    and (public.moj_zalacznik(id) or public.jestem_rodzicem())
  );

alter publication supabase_realtime add table public.deadlines;
alter publication supabase_realtime add table public.deadline_attachments;
```

- [ ] **Krok 3: Sprawdź, że RLS i polityki są na miejscu**

MCP `execute_sql`:

```sql
select tablename, policyname, cmd from pg_policies
 where tablename in ('deadlines', 'deadline_attachments')
 order by tablename, cmd;
```

Oczekiwane: po 4 wiersze dla `deadlines` (select/insert/update/delete) i po
3 dla `deadline_attachments` (select/insert/delete, bez update).

- [ ] **Krok 4: Pełny test RLS jednym scenariuszem**

MCP `execute_sql` (wszystko w jednej transakcji, `rollback` na końcu — zero
trwałych zmian):

```sql
begin;

insert into public.households (id, name) values
  ('99999999-aaaa-1111-1111-111111111111', 'TEST Dom A'),
  ('99999999-bbbb-1111-1111-111111111111', 'TEST Dom B');

insert into public.members (id, household_id, name, color, role, user_id) values
  ('99999999-aaaa-2222-1111-111111111111', '99999999-aaaa-1111-1111-111111111111', 'TEST Rodzic', 'fiolet', 'rodzic', '99999999-aaaa-2222-1111-111111111111'),
  ('99999999-aaaa-3333-1111-111111111111', '99999999-aaaa-1111-1111-111111111111', 'TEST Autor', 'zielony', 'domownik', '99999999-aaaa-3333-1111-111111111111'),
  ('99999999-aaaa-4444-1111-111111111111', '99999999-aaaa-1111-1111-111111111111', 'TEST Neutralny', 'blekitny', 'dziecko', '99999999-aaaa-4444-1111-111111111111'),
  ('99999999-bbbb-2222-1111-111111111111', '99999999-bbbb-1111-1111-111111111111', 'TEST Obcy', 'morski', 'rodzic', '99999999-bbbb-2222-1111-111111111111');

-- Autor (zwykly domownik, nie rodzic) dodaje termin i zalacznik - insert wolno kazdemu z domu.
select set_config('request.jwt.claims', json_build_object('sub', '99999999-aaaa-3333-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.deadlines (id, title, due_date) values
  ('99999999-aaaa-5555-1111-111111111111', 'TEST ubezpieczenie', '2026-12-01');

insert into public.deadline_attachments (id, deadline_id, storage_path, file_name, content_type, size_bytes) values
  ('99999999-aaaa-6666-1111-111111111111', '99999999-aaaa-5555-1111-111111111111', '99999999-aaaa-1111-1111-111111111111/99999999-aaaa-5555-1111-111111111111/test.pdf', 'test.pdf', 'application/pdf', 1234);

-- Rodzic z tego samego domu widzi oba wiersze.
select set_config('request.jwt.claims', json_build_object('sub', '99999999-aaaa-2222-1111-111111111111', 'role', 'authenticated')::text, true);
select count(*) as widzi_termin from public.deadlines where id = '99999999-aaaa-5555-1111-111111111111';
select count(*) as widzi_zalacznik from public.deadline_attachments where id = '99999999-aaaa-6666-1111-111111111111';

-- Obcy z innego domu nie widzi niczego.
select set_config('request.jwt.claims', json_build_object('sub', '99999999-bbbb-2222-1111-111111111111', 'role', 'authenticated')::text, true);
select count(*) as obcy_widzi_termin from public.deadlines where id = '99999999-aaaa-5555-1111-111111111111';
select count(*) as obcy_widzi_zalacznik from public.deadline_attachments where id = '99999999-aaaa-6666-1111-111111111111';

-- Neutralny domownik (ani autor, ani rodzic) odhacza termin - update wolno kazdemu z domu.
select set_config('request.jwt.claims', json_build_object('sub', '99999999-aaaa-4444-1111-111111111111', 'role', 'authenticated')::text, true);
update public.deadlines set completed = true where id = '99999999-aaaa-5555-1111-111111111111';
select completed as po_odhaczeniu from public.deadlines where id = '99999999-aaaa-5555-1111-111111111111';

-- Ten sam neutralny probuje usunac cudzy termin i zalacznik - RLS ma to
-- wyciszyc (0 wierszy skasowanych), nie zablokowac bledem.
delete from public.deadlines where id = '99999999-aaaa-5555-1111-111111111111';
delete from public.deadline_attachments where id = '99999999-aaaa-6666-1111-111111111111';
select count(*) as termin_przetrwal from public.deadlines where id = '99999999-aaaa-5555-1111-111111111111';
select count(*) as zalacznik_przetrwal from public.deadline_attachments where id = '99999999-aaaa-6666-1111-111111111111';

-- Rodzic usuwa cudzy zalacznik i termin - wolno, bo jest rodzicem.
select set_config('request.jwt.claims', json_build_object('sub', '99999999-aaaa-2222-1111-111111111111', 'role', 'authenticated')::text, true);
delete from public.deadline_attachments where id = '99999999-aaaa-6666-1111-111111111111';
delete from public.deadlines where id = '99999999-aaaa-5555-1111-111111111111';
select count(*) as termin_po_rodzicu from public.deadlines where id = '99999999-aaaa-5555-1111-111111111111';

rollback;
```

Oczekiwane, w kolejności: `widzi_termin=1`, `widzi_zalacznik=1`,
`obcy_widzi_termin=0`, `obcy_widzi_zalacznik=0`, `po_odhaczeniu=true`,
`termin_przetrwal=1`, `zalacznik_przetrwal=1` (neutralny nic nie usunął),
`termin_po_rodzicu=0` (rodzic usunął skutecznie).

- [ ] **Krok 5: Dopisz tę samą treść do `supabase/schema.sql`**

Na końcu pliku dodaj nagłówek sekcji i wklej dokładnie SQL z Kroku 2 (bez
części Storage — ta idzie w Zadaniu 2):

```sql
-- ============================================================
--  19. Ważne terminy
-- ============================================================
```

- [ ] **Krok 6: Commit**

```bash
git add supabase/schema.sql
git commit -m "Baza: tabele wazne terminy i zalaczniki"
```

---

### Zadanie 2: Storage — bucket i polityki załączników

**Pliki:**
- Modyfikacja: `supabase/schema.sql` (dopisanie sekcji 19, część 2)
- Migracja: `wazne_terminy_storage`

**Interfejsy:**
- Produkuje: bucket `deadline-attachments` (prywatny, limit 10 MB, typy
  image/jpeg|png|webp + application/pdf) i polityki select/insert/delete na
  `storage.objects` dla tego bucketu.

`file_size_limit`/`allowed_mime_types` na buckecie pilnuje Storage API przy
prawdziwym uploadzie z przeglądarki — bezpośredni insert SQL (poniższe testy)
go omija, bo to walidacja na poziomie serwisu Storage, nie triggera w bazie.
Dlatego typ/rozmiar testujemy inaczej: jednostkowo w Zadaniu 3
(`bladZalacznika`) i ręcznie w Zadaniu 7.

- [ ] **Krok 1: Sprawdź, że bucketu jeszcze nie ma**

MCP `execute_sql`:

```sql
select id from storage.buckets where id = 'deadline-attachments';
```

Oczekiwane: pusty wynik.

- [ ] **Krok 2: Zastosuj migrację**

MCP `apply_migration`, nazwa `wazne_terminy_storage`:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deadline-attachments',
  'deadline-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- Sciezka obiektu: {household_id}/{deadline_id}/{losowy-id}-{nazwa-pliku}.
-- Pierwszy segment sciezki to household_id - polityki porownuja go z moj_dom(),
-- ten sam podzial uprawnien co w tabeli deadline_attachments.
drop policy if exists "Zalaczniki terminow - odczyt storage" on storage.objects;
create policy "Zalaczniki terminow - odczyt storage" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'deadline-attachments'
    and (storage.foldername(name))[1] = public.moj_dom()::text
  );

drop policy if exists "Zalaczniki terminow - dodawanie storage" on storage.objects;
create policy "Zalaczniki terminow - dodawanie storage" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'deadline-attachments'
    and (storage.foldername(name))[1] = public.moj_dom()::text
  );

drop policy if exists "Zalaczniki terminow - usuwanie storage" on storage.objects;
create policy "Zalaczniki terminow - usuwanie storage" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'deadline-attachments'
    and (storage.foldername(name))[1] = public.moj_dom()::text
    and (owner_id = auth.uid()::text or public.jestem_rodzicem())
  );
```

- [ ] **Krok 3: Sprawdź, że polityki są na miejscu**

MCP `execute_sql`:

```sql
select policyname, cmd from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname like 'Zalaczniki terminow%'
 order by cmd;
```

Oczekiwane: 3 wiersze (select/insert/delete).

- [ ] **Krok 4: Test RLS — happy path i cichy brak uprawnień**

MCP `execute_sql` (jedna transakcja, `rollback` na końcu):

```sql
begin;

insert into public.households (id, name) values
  ('99999999-cccc-1111-1111-111111111111', 'TEST Dom C'),
  ('99999999-dddd-1111-1111-111111111111', 'TEST Dom D');

insert into public.members (id, household_id, name, color, role, user_id) values
  ('99999999-cccc-2222-1111-111111111111', '99999999-cccc-1111-1111-111111111111', 'TEST Rodzic C', 'fiolet', 'rodzic', '99999999-cccc-2222-1111-111111111111'),
  ('99999999-cccc-3333-1111-111111111111', '99999999-cccc-1111-1111-111111111111', 'TEST Dziecko C', 'zielony', 'dziecko', '99999999-cccc-3333-1111-111111111111'),
  ('99999999-cccc-4444-1111-111111111111', '99999999-cccc-1111-1111-111111111111', 'TEST Neutralny C', 'blekitny', 'domownik', '99999999-cccc-4444-1111-111111111111'),
  ('99999999-dddd-2222-1111-111111111111', '99999999-dddd-1111-1111-111111111111', 'TEST Obcy D', 'morski', 'rodzic', '99999999-dddd-2222-1111-111111111111');

-- Dziecko wgrywa dwa pliki do folderu wlasnego domu - insert wolno kazdemu z domu.
select set_config('request.jwt.claims', json_build_object('sub', '99999999-cccc-3333-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into storage.objects (bucket_id, name, owner_id) values
  ('deadline-attachments', '99999999-cccc-1111-1111-111111111111/test-termin/plik-x.pdf', '99999999-cccc-3333-1111-111111111111'),
  ('deadline-attachments', '99999999-cccc-1111-1111-111111111111/test-termin/plik-y.jpg', '99999999-cccc-3333-1111-111111111111');

-- Rodzic z tego samego domu widzi oba pliki.
select set_config('request.jwt.claims', json_build_object('sub', '99999999-cccc-2222-1111-111111111111', 'role', 'authenticated')::text, true);
select count(*) as rodzic_widzi from storage.objects
 where bucket_id = 'deadline-attachments' and name like '99999999-cccc-1111-1111-111111111111/%';

-- Obcy z innego domu nie widzi niczego z domu C.
select set_config('request.jwt.claims', json_build_object('sub', '99999999-dddd-2222-1111-111111111111', 'role', 'authenticated')::text, true);
select count(*) as obcy_widzi from storage.objects
 where bucket_id = 'deadline-attachments' and name like '99999999-cccc-1111-1111-111111111111/%';

-- Neutralny domownik (ani wgrywajacy, ani rodzic) probuje usunac cudzy plik -
-- RLS ma to wyciszyc (0 wierszy), nie zablokowac bledem.
select set_config('request.jwt.claims', json_build_object('sub', '99999999-cccc-4444-1111-111111111111', 'role', 'authenticated')::text, true);
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'deadline-attachments' and name = '99999999-cccc-1111-1111-111111111111/test-termin/plik-x.pdf';
select count(*) as plik_x_przetrwal from storage.objects
 where bucket_id = 'deadline-attachments' and name = '99999999-cccc-1111-1111-111111111111/test-termin/plik-x.pdf';

-- Rodzic usuwa cudzy plik (wgrany przez dziecko) - wolno, bo jest rodzicem.
select set_config('request.jwt.claims', json_build_object('sub', '99999999-cccc-2222-1111-111111111111', 'role', 'authenticated')::text, true);
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'deadline-attachments' and name = '99999999-cccc-1111-1111-111111111111/test-termin/plik-x.pdf';
select count(*) as plik_x_po_rodzicu from storage.objects
 where bucket_id = 'deadline-attachments' and name = '99999999-cccc-1111-1111-111111111111/test-termin/plik-x.pdf';

rollback;
```

Oczekiwane: `rodzic_widzi=2`, `obcy_widzi=0`, `plik_x_przetrwal=1` (neutralny
nic nie usunął), `plik_x_po_rodzicu=0` (rodzic usunął skutecznie).

- [ ] **Krok 5: Test RLS — wgranie do cudzego folderu musi się nie udać**

Osobne wywołanie MCP `execute_sql` (błąd przerywa transakcję, więc to musi
być ostatnia instrukcja swojego bloku):

```sql
begin;

insert into public.households (id, name) values
  ('99999999-cccc-1111-1111-111111111111', 'TEST Dom C2'),
  ('99999999-dddd-1111-1111-111111111111', 'TEST Dom D2');

insert into public.members (id, household_id, name, color, role, user_id) values
  ('99999999-cccc-3333-1111-111111111111', '99999999-cccc-1111-1111-111111111111', 'TEST Dziecko C2', 'zielony', 'dziecko', '99999999-cccc-3333-1111-111111111111');

select set_config('request.jwt.claims', json_build_object('sub', '99999999-cccc-3333-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into storage.objects (bucket_id, name, owner_id) values
  ('deadline-attachments', '99999999-dddd-1111-1111-111111111111/cudzy/plik.pdf', '99999999-cccc-3333-1111-111111111111');

rollback;
```

Oczekiwane: błąd `new row violates row-level security policy for table "objects"`.

- [ ] **Krok 6: Dopisz tę samą treść do `supabase/schema.sql`**

Bezpośrednio po sekcji z Zadania 1 (ten sam nagłówek „19. Ważne terminy" —
to jedna sekcja, dwie migracje), wklej SQL z Kroku 2.

- [ ] **Krok 7: Commit**

```bash
git add supabase/schema.sql
git commit -m "Baza: bucket Storage i polityki dla zalacznikow terminow"
```

---

### Zadanie 3: `src/terminy.ts` — logika domenowa

**Pliki:**
- Utworzenie: `src/terminy.ts`
- Test: `src/terminy.test.ts`

**Interfejsy:**
- Produkuje: typy `Zalacznik`, `Termin`; stałe `DOZWOLONE_TYPY_ZALACZNIKA`;
  funkcje `posortujTerminy<T extends { termin: string }>(terminy: T[]): T[]`,
  `czyPrzeterminowany(termin: string, dzisiaj: string): boolean`,
  `formatujTermin(dataStr: string): string`,
  `bladZalacznika(plik: { type: string; size: number }): string | null`.

- [ ] **Krok 1: Napisz nieprzechodzące testy**

```ts
// src/terminy.test.ts
import { describe, expect, it } from 'vitest'
import { bladZalacznika, czyPrzeterminowany, formatujTermin, posortujTerminy } from './terminy'

function t(id: string, termin: string) {
  return { id, termin }
}

describe('posortujTerminy', () => {
  it('sortuje rosnaco po dacie', () => {
    const wynik = posortujTerminy([
      t('pozniej', '2026-12-01'),
      t('najwczesniej', '2026-09-15'),
      t('srodek', '2026-10-01'),
    ])
    expect(wynik.map((x) => x.id)).toEqual(['najwczesniej', 'srodek', 'pozniej'])
  })

  it('nie zmienia tablicy wejsciowej', () => {
    const wejscie = [t('b', '2026-12-01'), t('a', '2026-09-01')]
    posortujTerminy(wejscie)
    expect(wejscie.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('czyPrzeterminowany', () => {
  it('data w przeszlosci jest przeterminowana', () => {
    expect(czyPrzeterminowany('2026-09-01', '2026-09-12')).toBe(true)
  })

  it('dzisiejsza data nie jest przeterminowana', () => {
    expect(czyPrzeterminowany('2026-09-12', '2026-09-12')).toBe(false)
  })

  it('data w przyszlosci nie jest przeterminowana', () => {
    expect(czyPrzeterminowany('2026-09-13', '2026-09-12')).toBe(false)
  })
})

describe('formatujTermin', () => {
  it('formatuje date po polsku z rokiem', () => {
    expect(formatujTermin('2026-12-01')).toBe('1 grudnia 2026')
  })

  it('nie gubi dnia przy przejsciu przez strefy - 1 stycznia zostaje 1 stycznia', () => {
    expect(formatujTermin('2027-01-01')).toBe('1 stycznia 2027')
  })
})

describe('bladZalacznika', () => {
  it('akceptuje PDF do 10 MB', () => {
    expect(bladZalacznika({ type: 'application/pdf', size: 5 * 1024 * 1024 })).toBeNull()
  })

  it('akceptuje zdjecie JPEG', () => {
    expect(bladZalacznika({ type: 'image/jpeg', size: 1024 })).toBeNull()
  })

  it('akceptuje plik dokladnie na limicie', () => {
    expect(bladZalacznika({ type: 'application/pdf', size: 10 * 1024 * 1024 })).toBeNull()
  })

  it('odrzuca plik wiekszy niz 10 MB', () => {
    expect(bladZalacznika({ type: 'application/pdf', size: 10 * 1024 * 1024 + 1 })).toContain('duży')
  })

  it('odrzuca niedozwolony typ pliku', () => {
    expect(bladZalacznika({ type: 'application/zip', size: 1024 })).toContain('Dozwolone')
  })
})
```

- [ ] **Krok 2: Uruchom testy — muszą nie przejść**

```bash
npm test -- terminy
```

Oczekiwane: FAIL — `./terminy` nie istnieje.

- [ ] **Krok 3: Zaimplementuj `src/terminy.ts`**

```ts
/** Ważny termin do zalatwienia (np. wygasajace ubezpieczenie), z opcjonalnymi zalacznikami. */
export type Zalacznik = {
  id: string
  nazwaPliku: string
  sciezka: string
  typ: string
  rozmiar: number
  autorId: string | null
}

export type Termin = {
  id: string
  tytul: string
  opis: string | null
  termin: string // 'RRRR-MM-DD'
  zalatwiony: boolean
  autorId: string | null
  dodano: string
  zalaczniki: Zalacznik[]
}

export const DOZWOLONE_TYPY_ZALACZNIKA = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAKS_ROZMIAR_ZALACZNIKA = 10 * 1024 * 1024

/** Terminy rosnaco po dacie - najpilniejszy pierwszy. */
export function posortujTerminy<T extends { termin: string }>(terminy: T[]): T[] {
  return [...terminy].sort((a, b) => a.termin.localeCompare(b.termin))
}

/** Czy termin juz minal - obie daty jako 'RRRR-MM-DD', porownanie tekstowe wystarcza. */
export function czyPrzeterminowany(termin: string, dzisiaj: string): boolean {
  return termin < dzisiaj
}

/** Np. '1 grudnia 2026'. Buduje Date z czesci roku/miesiaca/dnia, nie z gotowego
 * stringa - inaczej parsowanie jako UTC mogloby przesunac dzien w formatowaniu. */
export function formatujTermin(dataStr: string): string {
  const [rok, miesiac, dzien] = dataStr.split('-').map(Number)
  return new Date(rok, miesiac - 1, dzien).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Sprawdza plik przed wyslaniem - to samo ogranicza bucket w Storage, ale
 * lepiej powiedziec od razu, niz czekac na odrzucenie przez serwer. */
export function bladZalacznika(plik: { type: string; size: number }): string | null {
  if (!DOZWOLONE_TYPY_ZALACZNIKA.includes(plik.type)) {
    return 'Dozwolone są tylko zdjęcia (JPG/PNG/WebP) i pliki PDF.'
  }
  if (plik.size > MAKS_ROZMIAR_ZALACZNIKA) {
    return 'Plik jest za duży (maks. 10 MB).'
  }
  return null
}
```

- [ ] **Krok 4: Uruchom testy — muszą przejść**

```bash
npm test -- terminy
```

Oczekiwane: PASS, wszystkie 11 testów.

- [ ] **Krok 5: `npm run lint` i `npm run build` — muszą przejść**

```bash
npm run lint
npm run build
```

- [ ] **Krok 6: Commit**

```bash
git add src/terminy.ts src/terminy.test.ts
git commit -m "Logika terminow: sortowanie, przeterminowanie, walidacja zalacznika"
```

---

### Zadanie 4: `src/useTerminy.ts` — dane, Realtime, operacje

**Pliki:**
- Modyfikacja: `src/lib/supabase.ts` (typy `TerminDb`, `ZalacznikDb`)
- Utworzenie: `src/useTerminy.ts`

**Interfejsy:**
- Konsumuje: `Termin`, `Zalacznik`, `bladZalacznika` z `./terminy`;
  `useNaZywo` z `./useNaZywo`; `supabase` z `./lib/supabase`.
- Produkuje: `useTerminy(householdId: string, onBlad: (tekst: string) =>
  void)` zwracające `{ terminy: Termin[], ladowanie: boolean, dodaj(tytul,
  opis, dataTerminu): Promise<string | null>, przelaczZalatwiony(termin):
  Promise<void>, usunTermin(termin): Promise<void>, wgrajZalacznik(terminId,
  plik: File): Promise<void>, usunZalacznik(zalacznik): Promise<void>,
  linkDoZalacznika(zalacznik): Promise<string | null> }`.

- [ ] **Krok 1: Dopisz typy w `src/lib/supabase.ts`**

Na końcu pliku, po `NotatkaDb`:

```ts
/** Termin w tabeli deadlines. */
export type TerminDb = {
  id: string
  household_id: string
  title: string
  description: string | null
  due_date: string
  completed: boolean
  completed_at: string | null
  created_by: string | null
  created_at: string
}

/** Zalacznik do terminu w tabeli deadline_attachments. */
export type ZalacznikDb = {
  id: string
  deadline_id: string
  storage_path: string
  file_name: string
  content_type: string
  size_bytes: number
  created_by: string | null
  created_at: string
}
```

- [ ] **Krok 2: Napisz `src/useTerminy.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase, type TerminDb, type ZalacznikDb } from './lib/supabase'
import { useNaZywo } from './useNaZywo'
import type { Termin, Zalacznik } from './terminy'

const BUCKET = 'deadline-attachments'
const WAZNOSC_LINKU_S = 60

function zalacznikZBazy(z: ZalacznikDb): Zalacznik {
  return {
    id: z.id,
    nazwaPliku: z.file_name,
    sciezka: z.storage_path,
    typ: z.content_type,
    rozmiar: z.size_bytes,
    autorId: z.created_by,
  }
}

function terminZBazy(t: TerminDb, zalaczniki: Zalacznik[]): Termin {
  return {
    id: t.id,
    tytul: t.title,
    opis: t.description,
    termin: t.due_date,
    zalatwiony: t.completed,
    autorId: t.created_by,
    dodano: t.created_at,
    zalaczniki,
  }
}

/** Ważne terminy domu i ich załączniki, odświeżane na żywo. */
export function useTerminy(householdId: string, onBlad: (tekst: string) => void) {
  const [terminy, setTerminy] = useState<Termin[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  const wczytaj = useCallback(async () => {
    const { data: daneTerminow, error: bladTerminow } = await supabase
      .from('deadlines')
      .select('*')
      .order('due_date')

    if (bladTerminow) {
      onBlad(`Nie udało się wczytać terminów: ${bladTerminow.message}`)
      return
    }

    const { data: daneZalacznikow, error: bladZalacznikow } = await supabase
      .from('deadline_attachments')
      .select('*')
      .order('created_at')

    if (bladZalacznikow) {
      onBlad(`Nie udało się wczytać załączników: ${bladZalacznikow.message}`)
      return
    }

    const zalacznikiPoTerminie = new Map<string, Zalacznik[]>()
    for (const z of (daneZalacznikow ?? []) as ZalacznikDb[]) {
      const lista = zalacznikiPoTerminie.get(z.deadline_id) ?? []
      lista.push(zalacznikZBazy(z))
      zalacznikiPoTerminie.set(z.deadline_id, lista)
    }

    setTerminy(
      ((daneTerminow ?? []) as TerminDb[]).map((t) =>
        terminZBazy(t, zalacznikiPoTerminie.get(t.id) ?? []),
      ),
    )
  }, [onBlad])

  useEffect(() => {
    let aktualne = true

    void (async () => {
      await wczytaj()
      if (aktualne) setLadowanie(false)
    })()

    return () => {
      aktualne = false
    }
  }, [wczytaj])

  useNaZywo('terminy-na-zywo', ['deadlines', 'deadline_attachments'], () => void wczytaj())

  const dodaj = useCallback(
    async (tytul: string, opis: string, dataTerminu: string): Promise<string | null> => {
      const { data, error } = await supabase
        .from('deadlines')
        .insert({ title: tytul, description: opis || null, due_date: dataTerminu })
        .select('id')
        .single()

      if (error) {
        onBlad(`Nie udało się dodać terminu: ${error.message}`)
        return null
      }
      await wczytaj()
      return data.id as string
    },
    [wczytaj, onBlad],
  )

  /** Odhaczenie zapisujemy optymistycznie - to porzadkowanie, ma reagowac od razu. */
  const przelaczZalatwiony = useCallback(
    async (termin: Termin) => {
      const kopia = terminy
      const nowyStan = !termin.zalatwiony
      setTerminy((stare) => stare.map((t) => (t.id === termin.id ? { ...t, zalatwiony: nowyStan } : t)))

      const { error } = await supabase
        .from('deadlines')
        .update({ completed: nowyStan, completed_at: nowyStan ? new Date().toISOString() : null })
        .eq('id', termin.id)

      if (error) {
        setTerminy(kopia)
        onBlad(`Nie udało się zaktualizować terminu: ${error.message}`)
      }
    },
    [terminy, onBlad],
  )

  /** Kasuje pliki w Storage PRZED wierszem w bazie - po skasowaniu wiersza
   * traci sie liste storage_path do posprzatania. */
  const usunTermin = useCallback(
    async (termin: Termin) => {
      if (termin.zalaczniki.length > 0) {
        const { error: bladStorage } = await supabase.storage
          .from(BUCKET)
          .remove(termin.zalaczniki.map((z) => z.sciezka))
        if (bladStorage) {
          onBlad(`Nie udało się usunąć załączników: ${bladStorage.message}`)
          return
        }
      }

      const kopia = terminy
      setTerminy((stare) => stare.filter((t) => t.id !== termin.id))

      const { error } = await supabase.from('deadlines').delete().eq('id', termin.id)
      if (error) {
        setTerminy(kopia)
        onBlad(`Nie udało się usunąć terminu: ${error.message}`)
      }
    },
    [terminy, onBlad],
  )

  const wgrajZalacznik = useCallback(
    async (terminId: string, plik: File) => {
      const sciezka = `${householdId}/${terminId}/${crypto.randomUUID()}-${plik.name}`
      const { error: bladUploadu } = await supabase.storage
        .from(BUCKET)
        .upload(sciezka, plik, { contentType: plik.type })

      if (bladUploadu) {
        onBlad(`Nie udało się wgrać pliku: ${bladUploadu.message}`)
        return
      }

      const { error: bladZapisu } = await supabase.from('deadline_attachments').insert({
        deadline_id: terminId,
        storage_path: sciezka,
        file_name: plik.name,
        content_type: plik.type,
        size_bytes: plik.size,
      })

      if (bladZapisu) {
        onBlad(`Nie udało się zapisać załącznika: ${bladZapisu.message}`)
        await supabase.storage.from(BUCKET).remove([sciezka])
        return
      }
      await wczytaj()
    },
    [householdId, wczytaj, onBlad],
  )

  const usunZalacznik = useCallback(
    async (zalacznik: Zalacznik) => {
      const { error: bladStorage } = await supabase.storage.from(BUCKET).remove([zalacznik.sciezka])
      if (bladStorage) {
        onBlad(`Nie udało się usunąć pliku: ${bladStorage.message}`)
        return
      }

      const { error } = await supabase.from('deadline_attachments').delete().eq('id', zalacznik.id)
      if (error) {
        onBlad(`Nie udało się usunąć załącznika: ${error.message}`)
        return
      }
      await wczytaj()
    },
    [wczytaj, onBlad],
  )

  const linkDoZalacznika = useCallback(
    async (zalacznik: Zalacznik): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(zalacznik.sciezka, WAZNOSC_LINKU_S)

      if (error) {
        onBlad(`Nie udało się otworzyć pliku: ${error.message}`)
        return null
      }
      return data.signedUrl
    },
    [onBlad],
  )

  return {
    terminy,
    ladowanie,
    dodaj,
    przelaczZalatwiony,
    usunTermin,
    wgrajZalacznik,
    usunZalacznik,
    linkDoZalacznika,
  }
}
```

- [ ] **Krok 3: `npm run build` — musi przejść**

```bash
npm run build
```

Oczekiwane: PASS (hook nie jest jeszcze przez nikogo importowany — to
sanity-check składni i typów).

- [ ] **Krok 4: Commit**

```bash
git add src/lib/supabase.ts src/useTerminy.ts
git commit -m "Dane terminow: typy, Realtime, CRUD i upload zalacznikow"
```

---

### Zadanie 5: Ekran `src/Terminy.tsx`

**Pliki:**
- Utworzenie: `src/Terminy.tsx`
- Modyfikacja: `src/style/listy.css`
- Modyfikacja: `src/style/formularze.css`

**Interfejsy:**
- Konsumuje: `useTerminy` z `./useTerminy`; `posortujTerminy`,
  `czyPrzeterminowany`, `formatujTermin`, `bladZalacznika`,
  `DOZWOLONE_TYPY_ZALACZNIKA`, typy `Termin`/`Zalacznik` z `./terminy`;
  `klucz` z `./dates`; `kolor` z `./kolory`; `Arkusz` z `./uklad/Arkusz`;
  `TrybDodawania` z `./uklad/nawigacja`; `DomownikDb` z `./lib/supabase`.
- Produkuje: `Terminy(props)` — komponent ekranu, props: `{ jestemRodzicem:
  boolean, mojeId: string, householdId: string, osobaPoId: Map<string,
  DomownikDb>, onBlad: (tekst: string) => void, dodawanie: TrybDodawania }`.

- [ ] **Krok 1: Napisz `src/Terminy.tsx`**

```tsx
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { DomownikDb } from './lib/supabase'
import { useTerminy } from './useTerminy'
import {
  DOZWOLONE_TYPY_ZALACZNIKA,
  bladZalacznika,
  czyPrzeterminowany,
  formatujTermin,
  posortujTerminy,
  type Termin,
  type Zalacznik,
} from './terminy'
import { klucz } from './dates'
import { kolor } from './kolory'
import { Arkusz } from './uklad/Arkusz'
import type { TrybDodawania } from './uklad/nawigacja'

type Props = {
  jestemRodzicem: boolean
  mojeId: string
  householdId: string
  osobaPoId: Map<string, DomownikDb>
  onBlad: (tekst: string) => void
  dodawanie: TrybDodawania
}

/** Ekran „Terminy": ważne daty (np. koniec ubezpieczenia) z załącznikami. */
export function Terminy({ jestemRodzicem, mojeId, householdId, osobaPoId, onBlad, dodawanie }: Props) {
  const dane = useTerminy(householdId, onBlad)
  const [pokazZalatwione, setPokazZalatwione] = useState(false)

  const dzisiaj = klucz(new Date())
  const widoczne = useMemo(
    () => posortujTerminy(dane.terminy.filter((t) => pokazZalatwione || !t.zalatwiony)),
    [dane.terminy, pokazZalatwione],
  )

  function wgrajZWalidacja(terminId: string, plik: File) {
    const blad = bladZalacznika(plik)
    if (blad) {
      onBlad(blad)
      return
    }
    void dane.wgrajZalacznik(terminId, plik)
  }

  async function otworzZalacznik(zalacznik: Zalacznik) {
    const url = await dane.linkDoZalacznika(zalacznik)
    if (url) window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="terminy">
      {dodawanie === null ? (
        <FormularzTerminu onDodaj={dane.dodaj} />
      ) : (
        <Arkusz otwarty={dodawanie.otwarte} tytul="Nowy termin" onZamknij={dodawanie.onZamknij}>
          <FormularzTerminu onDodaj={dane.dodaj} onDodano={dodawanie.onZamknij} />
        </Arkusz>
      )}

      <label className="przelacznik-zalatwionych">
        <input
          type="checkbox"
          checked={pokazZalatwione}
          onChange={(e) => setPokazZalatwione(e.target.checked)}
        />
        Pokaż załatwione
      </label>

      {dane.ladowanie ? (
        <p className="pusto">Wczytuję…</p>
      ) : widoczne.length === 0 ? (
        <p className="pusto">Brak terminów do pokazania.</p>
      ) : (
        <ul className="karty-terminow">
          {widoczne.map((t) => (
            <KartaTerminu
              key={t.id}
              termin={t}
              autor={t.autorId ? osobaPoId.get(t.autorId) : undefined}
              przeterminowany={!t.zalatwiony && czyPrzeterminowany(t.termin, dzisiaj)}
              mogeUsunacTermin={jestemRodzicem || t.autorId === mojeId}
              mojeId={mojeId}
              jestemRodzicem={jestemRodzicem}
              onPrzelacz={() => void dane.przelaczZalatwiony(t)}
              onUsunTermin={() => void dane.usunTermin(t)}
              onWgrajZalacznik={(plik) => wgrajZWalidacja(t.id, plik)}
              onUsunZalacznik={(z) => void dane.usunZalacznik(z)}
              onOtworzZalacznik={(z) => void otworzZalacznik(z)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

type KartaTerminuProps = {
  termin: Termin
  autor: DomownikDb | undefined
  przeterminowany: boolean
  mogeUsunacTermin: boolean
  mojeId: string
  jestemRodzicem: boolean
  onPrzelacz: () => void
  onUsunTermin: () => void
  onWgrajZalacznik: (plik: File) => void
  onUsunZalacznik: (zalacznik: Zalacznik) => void
  onOtworzZalacznik: (zalacznik: Zalacznik) => void
}

function KartaTerminu({
  termin,
  autor,
  przeterminowany,
  mogeUsunacTermin,
  mojeId,
  jestemRodzicem,
  onPrzelacz,
  onUsunTermin,
  onWgrajZalacznik,
  onUsunZalacznik,
  onOtworzZalacznik,
}: KartaTerminuProps) {
  const wejscie = useRef<HTMLInputElement>(null)

  function wybranoPliki(e: ChangeEvent<HTMLInputElement>) {
    const pliki = e.target.files
    if (!pliki) return
    for (const plik of Array.from(pliki)) onWgrajZalacznik(plik)
    e.target.value = ''
  }

  return (
    <li
      className={`karta-terminu${przeterminowany ? ' przeterminowany' : ''}${
        termin.zalatwiony ? ' zalatwiony' : ''
      }`}
    >
      <label className="zalatwiony-checkbox">
        <input type="checkbox" checked={termin.zalatwiony} onChange={onPrzelacz} />
        <span className="tytul-terminu">{termin.tytul}</span>
      </label>

      {przeterminowany && <span className="znacznik-przeterminowania">Przeterminowany</span>}

      {termin.opis && <p className="opis-terminu">{termin.opis}</p>}

      <p className="data-terminu">Do {formatujTermin(termin.termin)}</p>

      {termin.zalaczniki.length > 0 && (
        <ul className="zalaczniki-terminu">
          {termin.zalaczniki.map((z) => (
            <li key={z.id} className="zalacznik-terminu">
              <button type="button" className="drobny" onClick={() => onOtworzZalacznik(z)}>
                📎 {z.nazwaPliku}
              </button>
              {(jestemRodzicem || z.autorId === mojeId) && (
                <button
                  type="button"
                  className="usun"
                  aria-label={`Usuń załącznik ${z.nazwaPliku}`}
                  onClick={() => onUsunZalacznik(z)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="stopka-terminu">
        <span className="autor-karteczki">
          {autor && (
            <span
              className="kropka"
              style={{ background: kolor(autor.color).kropka }}
              aria-hidden="true"
            />
          )}
          {autor?.name ?? 'ktoś'}
        </span>

        <button type="button" className="drobny" onClick={() => wejscie.current?.click()}>
          + Załącznik
        </button>
        <input
          ref={wejscie}
          type="file"
          accept={DOZWOLONE_TYPY_ZALACZNIKA.join(',')}
          multiple
          hidden
          onChange={wybranoPliki}
        />

        {mogeUsunacTermin && (
          <button type="button" className="usun" aria-label="Usuń termin" onClick={onUsunTermin}>
            ×
          </button>
        )}
      </div>
    </li>
  )
}

type FormularzTerminuProps = {
  onDodaj: (tytul: string, opis: string, data: string) => Promise<string | null>
  onDodano?: () => void
}

/** Pole nowego terminu. Osobny komponent, bo raz siedzi w stronie, a raz w arkuszu. */
function FormularzTerminu({ onDodaj, onDodano }: FormularzTerminuProps) {
  const [tytul, setTytul] = useState('')
  const [opis, setOpis] = useState('')
  const [data, setData] = useState('')
  const [zapisywanie, setZapisywanie] = useState(false)
  const pole = useRef<HTMLInputElement>(null)

  async function wyslij(e: FormEvent) {
    e.preventDefault()
    if (!tytul.trim() || !data) return

    setZapisywanie(true)
    const id = await onDodaj(tytul.trim(), opis.trim(), data)
    setZapisywanie(false)

    if (id) {
      setTytul('')
      setOpis('')
      setData('')
      pole.current?.focus()
      onDodano?.()
    }
  }

  return (
    <form className="karta formularz-terminu" onSubmit={(e) => void wyslij(e)}>
      <label htmlFor="tytul-terminu">Nowy termin</label>
      <input
        id="tytul-terminu"
        ref={pole}
        value={tytul}
        onChange={(e) => setTytul(e.target.value)}
        placeholder="np. Ubezpieczenie auta"
        maxLength={200}
      />

      <label htmlFor="opis-terminu">Opis (opcjonalnie)</label>
      <textarea
        id="opis-terminu"
        value={opis}
        onChange={(e) => setOpis(e.target.value)}
        placeholder="np. OC i AC w Warcie"
        maxLength={500}
        rows={2}
      />

      <label htmlFor="data-terminu">Do kiedy</label>
      <input id="data-terminu" type="date" value={data} onChange={(e) => setData(e.target.value)} />

      <button type="submit" disabled={zapisywanie || !tytul.trim() || !data}>
        {zapisywanie ? 'Zapisuję…' : 'Dodaj termin'}
      </button>
    </form>
  )
}
```

- [ ] **Krok 2: Dopisz style w `src/style/listy.css`**

Na końcu pliku:

```css
/* --- Ekran "Terminy" --- */

.terminy {
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.przelacznik-zalatwionych {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  font-size: 14px;
  color: var(--tekst-drugi);
  cursor: pointer;
}

.karty-terminow {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
  align-items: start;
}

.karta-terminu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--kreska);
  border-radius: 12px;
  background: var(--karta);
  box-shadow: var(--cien);
}

.karta-terminu.zalatwiony {
  opacity: 0.6;
}

.karta-terminu.zalatwiony .tytul-terminu {
  text-decoration: line-through;
}

.zalatwiony-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  font-weight: 600;
}

.znacznik-przeterminowania {
  align-self: flex-start;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--blad-tlo);
  color: var(--blad);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.opis-terminu {
  margin: 0;
  font-size: 14px;
  color: var(--tekst-drugi);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.data-terminu {
  margin: 0;
  font-size: 13px;
  color: var(--tekst-drugi);
}

.zalaczniki-terminu {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.zalacznik-terminu {
  display: flex;
  align-items: center;
  gap: 4px;
}

.zalacznik-terminu .drobny {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.stopka-terminu {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 4px;
  flex-wrap: wrap;
}

.stopka-terminu .autor-karteczki {
  margin-right: auto;
}

@media (max-width: 767px) {
  .karty-terminow {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Krok 3: Dopisz styl formularza w `src/style/formularze.css`**

`.formularz-notatki` (w tym samym pliku) stylizuje tylko `textarea` — formularz
terminu ma też zwykłe `input` (tytuł, data), więc potrzebuje własnego bloku.
Po `.formularz-notatki button:disabled`, wstaw:

```css
.formularz-terminu {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.formularz-terminu label {
  font-size: 13px;
  font-weight: 600;
  color: var(--tekst-drugi);
}

.formularz-terminu input,
.formularz-terminu textarea {
  padding: 12px;
  border: 1px solid var(--kreska);
  border-radius: 10px;
  background: var(--karta);
  color: var(--tekst);
  font: inherit;
  font-size: 15px;
  line-height: 1.45;
}

.formularz-terminu textarea {
  resize: vertical;
}

.formularz-terminu input:focus,
.formularz-terminu textarea:focus {
  outline: 2px solid var(--akcent);
  outline-offset: -1px;
  border-color: transparent;
}

.formularz-terminu button {
  align-self: flex-start;
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: var(--akcent);
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.formularz-terminu button:disabled {
  background: #c9c5d2;
  cursor: not-allowed;
}
```

W medium query „iOS przybliża stronę przy fokusie" (niżej w tym samym
pliku), dopisz `.formularz-terminu input`/`.formularz-terminu textarea` i
`.formularz-terminu button` do istniejących selektorów `min-height`/`font-size`
— ten sam wzorzec co `.formularz-notatki`.

- [ ] **Krok 4: `npm run lint` i `npm run build` — muszą przejść**

```bash
npm run lint
npm run build
```

Oczekiwane: PASS (komponent nie jest jeszcze podpięty do `App.tsx`, więc to
sanity-check składni/typów/CSS).

- [ ] **Krok 5: Commit**

```bash
git add src/Terminy.tsx src/style/listy.css src/style/formularze.css
git commit -m "Ekran Terminy: lista, formularz, zalaczniki"
```

---

### Zadanie 6: Nawigacja i podpięcie do `App.tsx`

**Pliki:**
- Modyfikacja: `src/uklad/nawigacja.ts`
- Modyfikacja: `src/App.tsx`
- Modyfikacja: `src/style/powloka.css`

- [ ] **Krok 1: Dodaj piąty ekran w `src/uklad/nawigacja.ts`**

```ts
export type Ekran = 'kalendarz' | 'zakupy' | 'tablica' | 'terminy' | 'dom'

export const EKRANY: Ekran[] = ['kalendarz', 'zakupy', 'tablica', 'terminy', 'dom']

export const TYTULY: Record<Ekran, string> = {
  kalendarz: 'Kalendarz',
  zakupy: 'Zakupy',
  tablica: 'Tablica',
  terminy: 'Terminy',
  dom: 'Mój dom',
}
```

I w `etykietaDodania`, dodaj przypadek przed `case 'dom':`:

```ts
    case 'terminy':
      return 'Dodaj termin'
```

- [ ] **Krok 2: Napraw sztywną liczbę kolumn dolnego paska w `src/style/powloka.css`**

Dopisanie piątej zakładki popsułoby dziś stały układ `repeat(4, 1fr)`. Znajdź:

```css
.pasek-dolny {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--warstwa-pasek);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding-bottom: env(safe-area-inset-bottom);
```

Zamień `grid-template-columns: repeat(4, 1fr);` na:

```css
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
```

Działa tak samo dla 4 zakładek jak i dla dowolnej innej liczby w przyszłości.

- [ ] **Krok 3: Podłącz ekran w `src/App.tsx`**

Dodaj import obok pozostałych ekranów:

```ts
import { Terminy } from './Terminy'
```

W drzewie warunków renderowania ekranu, między gałęzią `tablica` a `dom`,
dodaj:

```tsx
      ) : ekran === 'terminy' ? (
        <Terminy
          jestemRodzicem={jestemRodzicem}
          mojeId={profil.id}
          householdId={profil.household_id}
          osobaPoId={osobaPoId}
          onBlad={setBlad}
          dodawanie={trybDodawania('terminy')}
        />
```

- [ ] **Krok 4: `npm test`, `npm run lint`, `npm run build` — muszą przejść**

```bash
npm test
npm run lint
npm run build
```

- [ ] **Krok 5: Ręczny test w przeglądarce**

```bash
npm run dev
```

1. Zaloguj się, otwórz zakładkę „Terminy" (widoczna na komputerze u góry i na
   telefonie na dole — sprawdź oba szerokości okna).
2. Dodaj termin „Ubezpieczenie auta", data w przeszłości. Oczekiwane: karta
   z etykietą „Przeterminowany".
3. Dołącz plik PDF i zdjęcie przez „+ Załącznik" (wiele naraz). Oczekiwane:
   oba pojawiają się na liście załączników.
4. Kliknij nazwę załącznika. Oczekiwane: otwiera się w nowej karcie
   przeglądarki (signed URL).
5. Spróbuj dołączyć plik `.zip` albo większy niż 10 MB. Oczekiwane: czerwony
   baner z komunikatem, nic się nie wgrywa.
6. Odhacz „załatwione". Oczekiwane: karta znika z listy.
7. Włącz „Pokaż załatwione". Oczekiwane: karta wraca, przekreślona.
8. Usuń termin. Oczekiwane: znika z listy i z tabeli `deadline_attachments`
   ORAZ z bucketu Storage — sprawdź drugie MCP `execute_sql`:
   `select count(*) from storage.objects where bucket_id = 'deadline-attachments';`
   powinno spaść do 0, jeśli to był jedyny termin z załącznikami.
9. Otwórz zakładkę „Terminy" w **dwóch kartach przeglądarki naraz**. Dodaj
   termin w jednej i odhacz go jako „załatwiony" w drugiej. Oczekiwane: obie
   zmiany widać w drugiej karcie bez odświeżania strony (Realtime).

- [ ] **Krok 6: Commit**

```bash
git add src/uklad/nawigacja.ts src/App.tsx src/style/powloka.css
git commit -m "Podlacz ekran Terminy do nawigacji"
```

---

### Zadanie 7: README

**Pliki:**
- Modyfikacja: `README.md`

- [ ] **Krok 1: Dodaj sekcję o funkcji**

W `README.md`, po sekcji „Tablica", wstaw:

```markdown
## Ważne terminy

Zakładka **Terminy** to lista rzeczy z datą ważności, niezależna od
kalendarza — „do kiedy ważne jest ubezpieczenie auta", „kiedy kończy się
gwarancja" — razem z dokumentem, który do tego terminu należy (skan, zdjęcie,
PDF, do 10 MB na plik).

Przeterminowane i jeszcze nieodhaczone terminy są wyróżnione. Odhaczenie
„załatwione" chowa kartę z głównej listy — wraca po włączeniu „Pokaż
załatwione". Dodaje i widzi cały dom, odhacza każdy, usuwa autor albo rodzic.
Terminy nie mają edycji pól — pomyłkę poprawia się usunięciem i dodaniem od
nowa, tak jak przy notatkach i zakupach.

Pliki leżą w prywatnym buckecie Supabase Storage, dostępnym wyłącznie
domownikom tego samego domu — link do podglądu jest tymczasowy, generowany
na żądanie.
```

- [ ] **Krok 2: Uzupełnij tabelę „Struktura"**

Dopisz cztery wiersze, przed wierszem `src/lib/supabase.ts`:

| Plik | Do czego służy |
| --- | --- |
| `src/Terminy.tsx` | Ekran „Terminy": lista, formularz, załączniki |
| `src/useTerminy.ts` | Dane terminów, Realtime, upload/usuwanie w Storage |
| `src/terminy.ts` | Sortowanie, przeterminowanie, walidacja załącznika |

- [ ] **Krok 3: Commit**

```bash
git add README.md
git commit -m "README: wazne terminy"
```
