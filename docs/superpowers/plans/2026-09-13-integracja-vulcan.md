# Integracja z Vulcan — plan wdrożenia

> **Dla agentów:** WYMAGANY SUB-SKILL: użyj `superpowers:subagent-driven-development`
> (zalecane) albo `superpowers:executing-plans`, żeby wykonać ten plan zadanie po
> zadaniu. Kroki mają checkboxy (`- [ ]`) do odhaczania.

**Cel:** Nowa zakładka „Szkoła" — plan lekcji, sprawdziany/zadania domowe i
wiadomości z dziennika Vulcan (UONET+), pobierane automatycznie w tle i
pokazywane w Kokpicie bez logowania się gdzie indziej. Integracja jest
**wyłącznie do odczytu** — nic z Kokpitu nie trafia z powrotem do Vulcan.

**Architektura:** Biblioteka `vulcan-api-js` (npm) w dwóch Supabase Edge
Functions: `vulcan-polacz` (jednorazowa rejestracja urządzenia Tokenem/
Symbolem/PIN-em) i `vulcan-sync` (pobieranie danych, wywoływana przez
`pg_cron` o skonfigurowanych godzinach albo ręcznie z klienta). Cztery nowe
tabele danych + jedna tabela poświadczeń zamknięta na `service_role`.
Przeglądarka nigdy nie rozmawia z Vulcan — czyta wyłącznie z Supabase (RLS,
Realtime), jak reszta aplikacji.

**Stack:** Supabase (Postgres, RLS, Edge Functions/Deno, pg_cron, pg_net),
`npm:vulcan-api-js@3.5.4`, React 19 + TypeScript + Vite 8, vitest 5.

**Spec:** [`docs/superpowers/specs/2026-09-13-integracja-vulcan-design.md`](../specs/2026-09-13-integracja-vulcan-design.md)

## Ograniczenia globalne

- Nazwy tabel i kolumn w bazie **po angielsku**, nazwy funkcji, polityk i
  wartości w kolumnach tekstowych (status/typ) **po polsku** — dokładnie jak
  w całym `supabase/schema.sql` (np. `members.role in ('rodzic', 'domownik',
  'dziecko')`). Spec użył polskich nazw tabel (`vulcan_polaczenia` itd.) —
  ten plan celowo je tłumaczy na angielskie odpowiedniki (`vulcan_connections`
  itd.), żeby nie łamać tej konwencji. Nazwy typów TS/nazwy domenowe
  (`Uczen`, `Lekcja`, `Wpis`, `Wiadomosc`) zostają polskie, tak jak `Termin`/
  `Zalacznik` w `src/terminy.ts` mimo angielskiej tabeli `deadlines`.
- Każda zmiana schematu ląduje w **dwóch** miejscach: migracja w projekcie
  Supabase (MCP `apply_migration`) **i** dopisana do `supabase/schema.sql`
  (nowe sekcje 21-22). Projekt Supabase: ref `fqviwnzinpndyprcovxw`.
- Nowe funkcje w bazie: `security definer set search_path = public`.
- `vulcan_connections` i `vulcan_sync_log`: RLS włączone, **zero polityk**
  dla `authenticated`/`anon` — dokładnie jak `digest_log`. Jedyny dostęp
  z klienta do stanu połączenia idzie przez `security definer` funkcje.
- Vulcan API wywołuje **wyłącznie kod w Edge Functions** — nigdy przeglądarka.
- Poza zakresem tej wersji: oceny, frekwencja, odpowiadanie na wiadomości z
  poziomu Kokpitu. Nie dodawaj tych rzeczy.
- Testy `npm test`, lint `npm run lint`, build `npm run build` — muszą
  przechodzić przed każdym commitem dotykającym `src/`.
- Commity po polsku, stopka `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Kluczowe kształty danych z biblioteki `vulcan-api-js@3.5.4` (potwierdzone
  odczytem plików `.d.ts` paczki, nie dokumentacji) — używaj tych pól
  dosłownie, bez zgadywania:
  - `Student { symbol, symbol_code, pupil: { id, firstName, surname, ... },
    unit: { name, displayName, ... }, school, periods }` — **brak** pola
    klasy/oddziału na tym poziomie; oddział pojawia się dopiero na
    `Lesson.class.displayName` przy pierwszym pobraniu planu lekcji.
  - `Lesson { date: { date }, timeSlot: { start, end }, subject: { name },
    teacherPrimary: { displayName }, room: { code }, change?: LessonChanges,
    class: { displayName } }`.
  - `ChangedLesson { lessonDate: { date }, time: { start, end }, subject: {
    name } | undefined, note?, reason?, event? }`.
  - `Exam { key, topic, subject: { name }, deadline: { date } }`.
  - `Homework { key, content, subject: { name }, deadline }` (`deadline` typu
    `Date`, nie `DateTime` — niespójność w typach samej biblioteki).
  - `Message { globalKey, subject, content, sender, sentDate }`,
    `MessageBox { globalKey, name }`.
  - `Account { loginId, userLogin, userName, restUrl }` — zwracany przez
    `registerAccount()`, **musi być zapisany** obok `Keystore`, bo
    `new VulcanHebe(keystore, account)` przy każdym kolejnym synchronizowaniu
    wymaga obu.
  - Wszystkie klasy modeli to zwykłe obiekty danych (`Serializable`) bez
    zachowania poza polami — da się je bezpiecznie zapisać jako `jsonb` i
    odtworzyć jako zwykły obiekt JS (bez `new Klasa()`), bo biblioteka i tak
    tylko czyta z nich pola (potwierdzone w kodzie `selectStudent`/`Api`).

---

## Struktura plików

| Plik | Rola |
| --- | --- |
| `supabase/schema.sql` | modyfikacja — sekcja 21: tabele, RLS, funkcje; sekcja 22: harmonogram |
| `src/vulcan.ts` | nowy — typy domenowe, mapowanie z bazy, sortowanie/grupowanie, walidacja godzin |
| `src/vulcan.test.ts` | nowy — testy powyższego |
| `src/lib/supabase.ts` | modyfikacja — typy `UczenDb`, `LekcjaDb`, `WpisDb`, `WiadomoscDb` |
| `supabase/functions/_wspolne/vulcanApi.ts` | nowy — cienka warstwa nad `vulcan-api-js`: budowa `Keystore`/`VulcanHebe` z zapisanych danych |
| `supabase/functions/_wspolne/vulcanSync.ts` | nowy — logika "zsynchronizuj jeden dom", współdzielona przez oba Edge Functions |
| `supabase/functions/vulcan-sync/index.ts` | nowy — wywoływana przez `pg_cron` (wiele domów) albo ręcznie przez klienta (jeden dom) |
| `supabase/functions/vulcan-polacz/index.ts` | nowy — rejestracja urządzenia Tokenem/Symbolem/PIN-em + pierwsza synchronizacja |
| `src/useVulcan.ts` | nowy — dane (uczniowie/lekcje/wpisy/wiadomości/status), Realtime, akcje |
| `src/uklad/nawigacja.ts` | modyfikacja — szósty ekran `'szkola'` |
| `src/uklad/nawigacja.test.ts` | modyfikacja — test nowego ekranu |
| `src/App.tsx` | modyfikacja — szósta zakładka, przekazanie `useVulcan` do `MojDom` i `Szkola` |
| `src/MojDom.tsx` | modyfikacja — sekcja „Vulcan (dziennik elektroniczny)" |
| `src/Szkola.tsx` | nowy — ekran „Szkoła": filtr ucznia, plan lekcji / sprawdziany i ZD / wiadomości |
| `src/style/listy.css` | modyfikacja — style ekranu Szkoła (plan lekcji, lista wpisów, wiadomości) |
| `src/style/formularze.css` | modyfikacja — style formularza Token/Symbol/PIN i edytora godzin |
| `README.md` | modyfikacja — sekcja „Integracja z Vulcan", wiersze w „Struktura", instrukcja setupu |

---

### Zadanie 1: Schemat bazy — tabele, RLS, funkcje

**Pliki:**
- Modyfikacja: `supabase/schema.sql` (nowa sekcja 21)
- Migracja: `integracja_vulcan_tabele`

**Interfejsy:**
- Produkuje: tabele `vulcan_connections`, `vulcan_students`, `vulcan_lessons`,
  `vulcan_assignments`, `vulcan_messages`, `vulcan_sync_log`; funkcje
  `status_polaczenia_vulcan()`, `ustaw_godziny_sync_vulcan(text[])`,
  `rozlacz_vulcan()`, `przypisz_ucznia_vulcan(uuid, uuid)`. Funkcje
  `vulcan_do_synchronizacji`/`zamknij_sync_vulcan` dopisuje dopiero Zadanie 3
  (dopiero tam widać dokładny kształt, jakiego potrzebuje `vulcan-sync`).

- [ ] **Krok 1: Sprawdź, że tabel jeszcze nie ma**

MCP `execute_sql`:

```sql
select to_regclass('public.vulcan_connections');
select to_regclass('public.vulcan_students');
```

Oczekiwane: `null` z obu.

- [ ] **Krok 2: Zastosuj migrację `integracja_vulcan_tabele`**

MCP `apply_migration`:

```sql
-- ============================================================
--  21. Integracja z Vulcan
-- ============================================================

-- Jedno polaczenie na dom. Poswiadczenia dostepne WYLACZNIE przez
-- service_role (Edge Function) - RLS bez zadnej polityki, jak digest_log.
-- `account` to zserializowany wynik registerAccount() z vulcan-api-js -
-- potrzebny obok Keystore przy KAZDYM kolejnym polaczeniu z API.
create table if not exists public.vulcan_connections (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  connected_by_member uuid references public.members(id) on delete set null,
  certificate         text not null,
  fingerprint         text not null,
  private_key         text not null,
  firebase_token      text,
  device_model        text not null default 'Kokpit Rodzinny',
  account             jsonb not null,
  status              text not null default 'aktywne',
  sync_hours          text[] not null default '{}',
  last_error          text,
  created_at          timestamptz not null default now(),
  constraint vulcan_connections_status_check check (status in ('aktywne', 'wymaga_ponownej_rejestracji')),
  unique (household_id)
);

-- Uczniowie zwroceni przez konto Vulcan. `student_data` to zserializowany
-- obiekt Student z vulcan-api-js - potrzebny do selectStudent() przy kazdej
-- synchronizacji (biblioteka wymaga calego obiektu, nie samego id).
create table if not exists public.vulcan_students (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  vulcan_id    text not null,
  first_name   text not null,
  last_name    text not null,
  class_name   text,
  student_data jsonb not null,
  member_id    uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (household_id, vulcan_id)
);

create table if not exists public.vulcan_lessons (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.vulcan_students(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  lesson_date  date not null,
  start_time   time not null,
  end_time     time not null,
  subject      text not null,
  teacher      text,
  room         text,
  changed      boolean not null default false,
  change_note  text,
  created_at   timestamptz not null default now(),
  unique (student_id, lesson_date, start_time)
);

-- Sprawdziany i zadania domowe razem - `kind` rozroznia typ, `vulcan_key`
-- to Exam.key / Homework.key z biblioteki, klucz naturalny do upsertu.
create table if not exists public.vulcan_assignments (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.vulcan_students(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  kind         text not null,
  due_date     date not null,
  subject      text not null,
  description  text,
  vulcan_key   text not null,
  created_at   timestamptz not null default now(),
  constraint vulcan_assignments_kind_check check (kind in ('sprawdzian', 'zadanie_domowe')),
  unique (student_id, kind, vulcan_key)
);

create table if not exists public.vulcan_messages (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.vulcan_students(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  sender       text not null,
  subject      text not null,
  content      text not null,
  sent_at      timestamptz not null,
  vulcan_key   text not null,
  created_at   timestamptz not null default now(),
  unique (student_id, vulcan_key)
);

-- Anty-duplikacja syncu w tym samym oknie 15-minutowym - jak digest_log.
create table if not exists public.vulcan_sync_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  sync_date    date not null,
  sync_hour    text not null,
  status       text not null default 'w_toku',
  claimed_at   timestamptz not null default now(),
  finished_at  timestamptz,
  error        text,
  constraint vulcan_sync_log_status_check check (status in ('w_toku', 'ok', 'blad')),
  unique (household_id, sync_date, sync_hour)
);

create index if not exists vulcan_students_household_idx    on public.vulcan_students (household_id);
create index if not exists vulcan_lessons_household_idx     on public.vulcan_lessons (household_id);
create index if not exists vulcan_lessons_student_date_idx  on public.vulcan_lessons (student_id, lesson_date);
create index if not exists vulcan_assignments_household_idx on public.vulcan_assignments (household_id);
create index if not exists vulcan_messages_household_idx    on public.vulcan_messages (household_id);

alter table public.vulcan_students    alter column household_id set default public.moj_dom();
alter table public.vulcan_lessons     alter column household_id set default public.moj_dom();
alter table public.vulcan_assignments alter column household_id set default public.moj_dom();
alter table public.vulcan_messages    alter column household_id set default public.moj_dom();

alter table public.vulcan_connections enable row level security;
alter table public.vulcan_sync_log    enable row level security;
alter table public.vulcan_students    enable row level security;
alter table public.vulcan_lessons     enable row level security;
alter table public.vulcan_assignments enable row level security;
alter table public.vulcan_messages    enable row level security;

-- vulcan_connections i vulcan_sync_log: CELOWO bez zadnej polityki dla
-- authenticated/anon - trzymaja poswiadczenia, dostep wylacznie service_role.

-- Dane szkolne: caly dom czyta, zero zapisu z klienta (dane plyna tylko
-- z Edge Function kluczem service_role, ktory i tak omija RLS).
drop policy if exists "Uczniowie Vulcan - odczyt" on public.vulcan_students;
create policy "Uczniowie Vulcan - odczyt" on public.vulcan_students
  for select to authenticated
  using (household_id = public.moj_dom());

drop policy if exists "Lekcje Vulcan - odczyt" on public.vulcan_lessons;
create policy "Lekcje Vulcan - odczyt" on public.vulcan_lessons
  for select to authenticated
  using (household_id = public.moj_dom());

drop policy if exists "Wpisy Vulcan - odczyt" on public.vulcan_assignments;
create policy "Wpisy Vulcan - odczyt" on public.vulcan_assignments
  for select to authenticated
  using (household_id = public.moj_dom());

drop policy if exists "Wiadomosci Vulcan - odczyt" on public.vulcan_messages;
create policy "Wiadomosci Vulcan - odczyt" on public.vulcan_messages
  for select to authenticated
  using (household_id = public.moj_dom());

-- Status polaczenia - bezpieczna projekcja `vulcan_connections` bez
-- poswiadczen. Zwraca zero wierszy, gdy dom nie ma polaczenia.
create or replace function public.status_polaczenia_vulcan()
  returns table (istnieje boolean, status text, sync_hours text[],
                 polaczyl text, ostatni_blad text, uczniowie jsonb)
  language sql stable security definer set search_path = public
as $$
  select
    true,
    c.status,
    c.sync_hours,
    m.name,
    c.last_error,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                 'id', s.id, 'imie', s.first_name, 'nazwisko', s.last_name,
                 'klasa', s.class_name, 'memberId', s.member_id))
         from public.vulcan_students s
        where s.household_id = c.household_id),
      '[]'::jsonb
    )
    from public.vulcan_connections c
    left join public.members m on m.id = c.connected_by_member
   where c.household_id = public.moj_dom()
$$;

grant execute on function public.status_polaczenia_vulcan() to authenticated;

-- Godziny synchronizacji - tylko rodzic, tylko wlasny dom. Walidacja formatu
-- (HH:MM) i limitu 3 wpisow zyje w TS (src/vulcan.ts) - tu tylko zapis.
create or replace function public.ustaw_godziny_sync_vulcan(p_godziny text[])
  returns void
  language plpgsql volatile security definer set search_path = public
as $$
begin
  if not public.jestem_rodzicem() then
    raise exception 'Tylko rodzic moze zmienic godziny synchronizacji.';
  end if;

  update public.vulcan_connections
     set sync_hours = p_godziny
   where household_id = public.moj_dom();

  if not found then
    raise exception 'Brak polaczenia z Vulcan dla tego domu.';
  end if;
end
$$;

grant execute on function public.ustaw_godziny_sync_vulcan(text[]) to authenticated;

-- Rozlaczenie - kasuje polaczenie i wszystkie dane szkolne tego domu.
-- Usuwa vulcan_students osobno, bo tabele danych wskazuja na household_id,
-- nie na vulcan_connections.id - kasowanie connections samo ich nie zabierze.
create or replace function public.rozlacz_vulcan()
  returns void
  language plpgsql volatile security definer set search_path = public
as $$
declare
  dom uuid := public.moj_dom();
begin
  if not public.jestem_rodzicem() then
    raise exception 'Tylko rodzic moze rozlaczyc Vulcan.';
  end if;

  delete from public.vulcan_students where household_id = dom;
  delete from public.vulcan_connections where household_id = dom;
end
$$;

grant execute on function public.rozlacz_vulcan() to authenticated;

-- Przypisanie ucznia do domownika - osobna funkcja zamiast polityki UPDATE
-- na vulcan_students, zeby rodzic nie mogl nadpisac innych kolumn (np.
-- student_data) z poziomu klienta. Ten sam wzorzec co ustaw_powiadomienia.
create or replace function public.przypisz_ucznia_vulcan(p_uczen uuid, p_member uuid)
  returns void
  language plpgsql volatile security definer set search_path = public
as $$
declare
  dom uuid := public.moj_dom();
begin
  if not public.jestem_rodzicem() then
    raise exception 'Tylko rodzic moze przypisywac uczniow.';
  end if;

  if p_member is not null and not exists (
    select 1 from public.members where id = p_member and household_id = dom
  ) then
    raise exception 'Ta osoba nie nalezy do tego domu.';
  end if;

  update public.vulcan_students
     set member_id = p_member
   where id = p_uczen and household_id = dom;

  if not found then
    raise exception 'Nie znaleziono ucznia w tym domu.';
  end if;
end
$$;

grant execute on function public.przypisz_ucznia_vulcan(uuid, uuid) to authenticated;

revoke execute on function public.status_polaczenia_vulcan()          from public, anon;
revoke execute on function public.ustaw_godziny_sync_vulcan(text[])    from public, anon;
revoke execute on function public.rozlacz_vulcan()                     from public, anon;
revoke execute on function public.przypisz_ucznia_vulcan(uuid, uuid)   from public, anon;

alter publication supabase_realtime add table public.vulcan_students;
alter publication supabase_realtime add table public.vulcan_lessons;
alter publication supabase_realtime add table public.vulcan_assignments;
alter publication supabase_realtime add table public.vulcan_messages;
```

- [ ] **Krok 3: Zweryfikuj**

MCP `execute_sql`:

```sql
select status, sync_hours from public.status_polaczenia_vulcan();
```

Oczekiwane: zero wierszy (nikt jeszcze nie połączył Vulcan) — zapytanie ma
się wykonać bez błędu, nie musi nic zwrócić.

- [ ] **Krok 4: Dopisz sekcję 21 do `supabase/schema.sql`**

Skopiuj dokładnie tę samą treść co w Kroku 2 na koniec pliku
`supabase/schema.sql` (po sekcji 20).

- [ ] **Krok 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "Integracja z Vulcan: tabele, RLS i funkcje pomocnicze

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 2: `src/vulcan.ts` — typy domenowe i logika czysta

**Pliki:**
- Utworzenie: `src/vulcan.ts`
- Utworzenie: `src/vulcan.test.ts`
- Modyfikacja: `src/lib/supabase.ts`

**Interfejsy:**
- Produkuje: typy `Uczen`, `Lekcja`, `Wpis`, `Wiadomosc`, `StatusPolaczenia`;
  funkcje `uczenZBazy`, `lekcjaZBazy`, `wpisZBazy`, `wiadomoscZBazy`,
  `posortujLekcje`, `pogrupujLekcjePoDniu`, `posortujWpisy`,
  `posortujWiadomosci`, `bladGodzinySync`; typy DB
  `UczenDb`, `LekcjaDb`, `WpisDb`, `WiadomoscDb` w `src/lib/supabase.ts`.

- [ ] **Krok 1: Dopisz typy w `src/lib/supabase.ts`**

Znajdź miejsce obok `TerminDb`/`ZalacznikDb` i dopisz:

```ts
export type UczenDb = {
  id: string
  household_id: string
  vulcan_id: string
  first_name: string
  last_name: string
  class_name: string | null
  member_id: string | null
  created_at: string
}

export type LekcjaDb = {
  id: string
  student_id: string
  household_id: string
  lesson_date: string
  start_time: string
  end_time: string
  subject: string
  teacher: string | null
  room: string | null
  changed: boolean
  change_note: string | null
  created_at: string
}

export type WpisDb = {
  id: string
  student_id: string
  household_id: string
  kind: 'sprawdzian' | 'zadanie_domowe'
  due_date: string
  subject: string
  description: string | null
  vulcan_key: string
  created_at: string
}

export type WiadomoscDb = {
  id: string
  student_id: string
  household_id: string
  sender: string
  subject: string
  content: string
  sent_at: string
  vulcan_key: string
  created_at: string
}
```

- [ ] **Krok 2: Napisz `src/vulcan.ts`**

```ts
import type { LekcjaDb, UczenDb, WiadomoscDb, WpisDb } from './lib/supabase'

export type Uczen = {
  id: string
  imie: string
  nazwisko: string
  klasa: string | null
  memberId: string | null
}

export type Lekcja = {
  id: string
  uczenId: string
  data: string
  od: string
  do: string
  przedmiot: string
  nauczyciel: string | null
  sala: string | null
  zmieniona: boolean
  opisZmiany: string | null
}

export type Wpis = {
  id: string
  uczenId: string
  typ: 'sprawdzian' | 'zadanie_domowe'
  data: string
  przedmiot: string
  opis: string | null
}

export type Wiadomosc = {
  id: string
  uczenId: string
  nadawca: string
  temat: string
  tresc: string
  data: string
}

export type StatusPolaczenia = {
  istnieje: boolean
  status: 'aktywne' | 'wymaga_ponownej_rejestracji' | null
  godzinySync: string[]
  polaczylImie: string | null
  ostatniBlad: string | null
  uczniowie: Uczen[]
}

export function uczenZBazy(u: UczenDb): Uczen {
  return {
    id: u.id,
    imie: u.first_name,
    nazwisko: u.last_name,
    klasa: u.class_name,
    memberId: u.member_id,
  }
}

export function lekcjaZBazy(l: LekcjaDb): Lekcja {
  return {
    id: l.id,
    uczenId: l.student_id,
    data: l.lesson_date,
    od: l.start_time.slice(0, 5),
    do: l.end_time.slice(0, 5),
    przedmiot: l.subject,
    nauczyciel: l.teacher,
    sala: l.room,
    zmieniona: l.changed,
    opisZmiany: l.change_note,
  }
}

export function wpisZBazy(w: WpisDb): Wpis {
  return {
    id: w.id,
    uczenId: w.student_id,
    typ: w.kind,
    data: w.due_date,
    przedmiot: w.subject,
    opis: w.description,
  }
}

export function wiadomoscZBazy(m: WiadomoscDb): Wiadomosc {
  return {
    id: m.id,
    uczenId: m.student_id,
    nadawca: m.sender,
    temat: m.subject,
    tresc: m.content,
    data: m.sent_at,
  }
}

/** Lekcje posortowane chronologicznie w obrębie dnia. */
export function posortujLekcje<T extends { data: string; od: string }>(lekcje: T[]): T[] {
  return [...lekcje].sort((a, b) => (a.data === b.data ? a.od.localeCompare(b.od) : a.data.localeCompare(b.data)))
}

/** Lekcje pogrupowane po dacie (`RRRR-MM-DD`), każda grupa już posortowana godzinami. */
export function pogrupujLekcjePoDniu(lekcje: Lekcja[]): Map<string, Lekcja[]> {
  const posortowane = posortujLekcje(lekcje)
  const grupy = new Map<string, Lekcja[]>()
  for (const l of posortowane) {
    const grupa = grupy.get(l.data) ?? []
    grupa.push(l)
    grupy.set(l.data, grupa)
  }
  return grupy
}

/** Sprawdziany i zadania domowe chronologicznie, najbliższe pierwsze. */
export function posortujWpisy<T extends { data: string }>(wpisy: T[]): T[] {
  return [...wpisy].sort((a, b) => a.data.localeCompare(b.data))
}

/** Wiadomości od najnowszej. */
export function posortujWiadomosci<T extends { data: string }>(wiadomosci: T[]): T[] {
  return [...wiadomosci].sort((a, b) => b.data.localeCompare(a.data))
}

const WZORZEC_GODZINY = /^([01]\d|2[0-3]):[0-5]\d$/
export const MAKS_GODZIN_SYNC = 3

/** Komunikat błędu dla `godziny`, albo `null` gdy poprawne (format `HH:MM`,
 * bez duplikatów, maksymalnie `MAKS_GODZIN_SYNC` wpisów). */
export function bladGodzinySync(godziny: string[]): string | null {
  if (godziny.length === 0) return 'Podaj przynajmniej jedną godzinę.'
  if (godziny.length > MAKS_GODZIN_SYNC) return `Maksymalnie ${MAKS_GODZIN_SYNC} godziny dziennie.`
  if (new Set(godziny).size !== godziny.length) return 'Ta sama godzina podana dwa razy.'
  if (!godziny.every((g) => WZORZEC_GODZINY.test(g))) return 'Nieprawidłowy format godziny.'
  return null
}
```

- [ ] **Krok 3: Napisz `src/vulcan.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  bladGodzinySync,
  pogrupujLekcjePoDniu,
  posortujLekcje,
  posortujWiadomosci,
  posortujWpisy,
  type Lekcja,
} from './vulcan'

function lekcja(dane: Partial<Lekcja>): Lekcja {
  return {
    id: 'l1',
    uczenId: 'u1',
    data: '2026-09-14',
    od: '08:00',
    do: '08:45',
    przedmiot: 'Matematyka',
    nauczyciel: null,
    sala: null,
    zmieniona: false,
    opisZmiany: null,
    ...dane,
  }
}

describe('posortujLekcje', () => {
  it('sortuje najpierw po dacie, potem po godzinie', () => {
    const wynik = posortujLekcje([
      lekcja({ id: 'a', data: '2026-09-15', od: '08:00' }),
      lekcja({ id: 'b', data: '2026-09-14', od: '09:00' }),
      lekcja({ id: 'c', data: '2026-09-14', od: '08:00' }),
    ])
    expect(wynik.map((l) => l.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('pogrupujLekcjePoDniu', () => {
  it('grupuje po dacie i sortuje wewnątrz grupy', () => {
    const grupy = pogrupujLekcjePoDniu([
      lekcja({ id: 'a', data: '2026-09-14', od: '09:00' }),
      lekcja({ id: 'b', data: '2026-09-14', od: '08:00' }),
    ])
    expect(grupy.get('2026-09-14')?.map((l) => l.id)).toEqual(['b', 'a'])
  })
})

describe('posortujWpisy', () => {
  it('sortuje chronologicznie', () => {
    const wynik = posortujWpisy([{ data: '2026-09-20' }, { data: '2026-09-15' }])
    expect(wynik.map((w) => w.data)).toEqual(['2026-09-15', '2026-09-20'])
  })
})

describe('posortujWiadomosci', () => {
  it('sortuje od najnowszej', () => {
    const wynik = posortujWiadomosci([{ data: '2026-09-01' }, { data: '2026-09-10' }])
    expect(wynik.map((w) => w.data)).toEqual(['2026-09-10', '2026-09-01'])
  })
})

describe('bladGodzinySync', () => {
  it('akceptuje 1-3 unikalne godziny HH:MM', () => {
    expect(bladGodzinySync(['06:00', '13:30', '19:00'])).toBeNull()
  })

  it('odrzuca pustą listę', () => {
    expect(bladGodzinySync([])).toContain('przynajmniej jedną')
  })

  it('odrzuca więcej niż 3 godziny', () => {
    expect(bladGodzinySync(['06:00', '10:00', '14:00', '18:00'])).toContain('Maksymalnie')
  })

  it('odrzuca duplikaty', () => {
    expect(bladGodzinySync(['06:00', '06:00'])).toContain('dwa razy')
  })

  it('odrzuca zły format', () => {
    expect(bladGodzinySync(['6:00'])).not.toBeNull()
    expect(bladGodzinySync(['25:00'])).not.toBeNull()
  })
})
```

- [ ] **Krok 4: Uruchom testy**

```bash
npm test -- --run
```

Oczekiwane: wszystkie testy przechodzą, w tym nowe z `vulcan.test.ts`.

- [ ] **Krok 5: Commit**

```bash
git add src/vulcan.ts src/vulcan.test.ts src/lib/supabase.ts
git commit -m "Integracja z Vulcan: typy domenowe i logika czysta

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 3: Edge Functions — `vulcanApi.ts`, `vulcanSync.ts`, `vulcan-sync`

**Pliki:**
- Utworzenie: `supabase/functions/_wspolne/vulcanApi.ts`
- Utworzenie: `supabase/functions/_wspolne/vulcanSync.ts`
- Utworzenie: `supabase/functions/vulcan-sync/index.ts`
- Modyfikacja: `supabase/schema.sql` (dokończenie sekcji 21: funkcje harmonogramu)
- Migracja: `integracja_vulcan_harmonogram_funkcje`

**Interfejsy:**
- Produkuje: `zbudujVulcanHebe(connection): Promise<VulcanHebe>`,
  `synchronizujDom(baza, householdId): Promise<{ok: boolean, blad?: string}>`
  — funkcja rdzenia, używana też przez Zadanie 4; funkcje SQL
  `vulcan_do_synchronizacji(timestamptz)`, `zamknij_sync_vulcan(uuid, text)`.

To najważniejszy i najbardziej ryzykowny plik integracji — poświęć więcej
uwagi weryfikacji przy pierwszym realnym połączeniu (patrz Krok 5).

- [ ] **Krok 1: Napisz `supabase/functions/_wspolne/vulcanApi.ts`**

```ts
import { Keystore, VulcanHebe } from 'npm:vulcan-api-js@3.5.4'

/** Wiersz `vulcan_connections` - dokładnie te kolumny, których potrzebuje ta warstwa. */
export type WierszPolaczenia = {
  certificate: string
  fingerprint: string
  private_key: string
  firebase_token: string | null
  device_model: string
  account: unknown
}

/**
 * Odtwarza klienta Vulcan z zapisanych poświadczeń. `Keystore`/`Account` w
 * bibliotece to zwykłe obiekty danych (klasa `Serializable` bez zachowania) -
 * odtworzenie ich jako plain object wystarcza, biblioteka i tak tylko czyta
 * z nich pola (potwierdzone w kodzie `selectStudent`/`Api` samej paczki).
 */
export async function zbudujVulcanHebe(polaczenie: WierszPolaczenia): Promise<VulcanHebe> {
  const keystore = new Keystore()
  keystore.loadFromObject({
    certificate: polaczenie.certificate,
    fingerprint: polaczenie.fingerprint,
    privateKey: polaczenie.private_key,
    firebaseToken: polaczenie.firebase_token ?? '',
    deviceModel: polaczenie.device_model,
  })
  return new VulcanHebe(keystore, polaczenie.account as never)
}
```

- [ ] **Krok 2: Napisz `supabase/functions/_wspolne/vulcanSync.ts`**

```ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Student } from 'npm:vulcan-api-js@3.5.4'
import { zbudujVulcanHebe, type WierszPolaczenia } from './vulcanApi.ts'

type WierszUcznia = { id: string; student_data: unknown }

function poczatekTygodnia(d: Date): Date {
  const kopia = new Date(d)
  const dzien = (kopia.getDay() + 6) % 7 // 0 = poniedziałek
  kopia.setDate(kopia.getDate() - dzien)
  kopia.setHours(0, 0, 0, 0)
  return kopia
}

function koniecTygodnia(poczatek: Date): Date {
  const kopia = new Date(poczatek)
  kopia.setDate(kopia.getDate() + 7)
  return kopia
}

/**
 * Synchronizuje jeden dom: dla każdego przypisanego ucznia pobiera plan
 * lekcji, zmiany, sprawdziany, zadania domowe i wiadomości, zapisuje do
 * naszych tabel. Współdzielona przez `vulcan-sync` (cron, wiele domów) i
 * `vulcan-polacz` (pierwsza synchronizacja od razu po rejestracji).
 *
 * Błąd sesji (certyfikat/token nieważny) ustawia
 * `status = 'wymaga_ponownej_rejestracji'` i przerywa - reszta synchronizacji
 * i tak by się nie udała bez ważnych poświadczeń.
 */
export async function synchronizujDom(
  baza: SupabaseClient,
  householdId: string,
): Promise<{ ok: boolean; blad?: string }> {
  const { data: polaczenie, error: bladPolaczenia } = await baza
    .from('vulcan_connections')
    .select('*')
    .eq('household_id', householdId)
    .single()

  if (bladPolaczenia || !polaczenie) {
    return { ok: false, blad: `Brak połączenia z Vulcan: ${bladPolaczenia?.message ?? 'nie znaleziono'}` }
  }

  const { data: uczniowie, error: bladUczniow } = await baza
    .from('vulcan_students')
    .select('id, student_data')
    .eq('household_id', householdId)
    .not('member_id', 'is', null)

  if (bladUczniow) {
    return { ok: false, blad: `Nie udało się wczytać uczniów: ${bladUczniow.message}` }
  }

  let vulcan
  try {
    vulcan = await zbudujVulcanHebe(polaczenie as WierszPolaczenia)
  } catch (e) {
    return { ok: false, blad: `Nie udało się zbudować klienta Vulcan: ${String(e)}` }
  }

  const poczatek = poczatekTygodnia(new Date())
  const koniec = koniecTygodnia(poczatek)

  for (const uczen of (uczniowie ?? []) as WierszUcznia[]) {
    try {
      await vulcan.selectStudent(uczen.student_data as Student)

      const lekcje = await vulcan.getLessons(poczatek, koniec)
      const zmiany = await vulcan.getChangedLessons(poczatek, koniec)

      const wierszeLekcji = lekcje
        .filter((l) => l.date?.date && l.timeSlot?.start && l.timeSlot?.end)
        .map((l) => ({
          student_id: uczen.id,
          lesson_date: l.date!.date,
          start_time: l.timeSlot!.start,
          end_time: l.timeSlot!.end,
          subject: l.subject?.name ?? l.event ?? '(brak przedmiotu)',
          teacher: l.teacherPrimary?.displayName ?? null,
          room: l.room?.code ?? null,
          changed: false,
          change_note: null,
        }))

      // Zmiany NADPISUJĄ zwykłą lekcję w tym samym slocie (ten sam klucz
      // unikalności student_id+lesson_date+start_time) - upsert w kolejności
      // "najpierw plan, potem zmiany" daje efekt "zmiana wygrywa".
      const wierszeZmian = zmiany
        .filter((z) => z.lessonDate?.date && z.time?.start && z.time?.end)
        .map((z) => ({
          student_id: uczen.id,
          lesson_date: z.lessonDate!.date,
          start_time: z.time!.start,
          end_time: z.time!.end,
          subject: z.subject?.name ?? z.event ?? '(zmiana planu)',
          teacher: z.teacher?.displayName ?? null,
          room: z.room?.code ?? null,
          changed: true,
          change_note: z.note ?? z.reason ?? z.event ?? null,
        }))

      if (wierszeLekcji.length > 0) {
        await baza.from('vulcan_lessons').upsert(wierszeLekcji, { onConflict: 'student_id,lesson_date,start_time' })
      }
      if (wierszeZmian.length > 0) {
        await baza.from('vulcan_lessons').upsert(wierszeZmian, { onConflict: 'student_id,lesson_date,start_time' })
      }

      const sprawdziany = await vulcan.getExams()
      const wierszeSprawdzianow = sprawdziany
        .filter((e) => e.deadline?.date)
        .map((e) => ({
          student_id: uczen.id,
          kind: 'sprawdzian' as const,
          due_date: e.deadline!.date,
          subject: e.subject?.name ?? '(brak przedmiotu)',
          description: e.topic ?? null,
          vulcan_key: e.key,
        }))
      if (wierszeSprawdzianow.length > 0) {
        await baza.from('vulcan_assignments').upsert(wierszeSprawdzianow, { onConflict: 'student_id,kind,vulcan_key' })
      }

      const zadania = await vulcan.getHomework()
      const wierszeZadan = (zadania as Array<Record<string, unknown>>)
        .filter((z) => z.deadline)
        .map((z) => ({
          student_id: uczen.id,
          kind: 'zadanie_domowe' as const,
          due_date: new Date(z.deadline as string | number | Date).toISOString().slice(0, 10),
          subject: (z.subject as { name?: string } | undefined)?.name ?? '(brak przedmiotu)',
          description: (z.content as string | undefined) ?? null,
          vulcan_key: String(z.key),
        }))
      if (wierszeZadan.length > 0) {
        await baza.from('vulcan_assignments').upsert(wierszeZadan, { onConflict: 'student_id,kind,vulcan_key' })
      }

      const skrzynki = await vulcan.getMessageBoxes()
      const wiadomosci: Array<Record<string, unknown>> = []
      for (const skrzynka of skrzynki as Array<Record<string, unknown>>) {
        const klucz = skrzynka.globalKey as string | undefined
        if (!klucz) continue
        const zSkrzynki = await vulcan.getMessages(klucz)
        wiadomosci.push(...(zSkrzynki as Array<Record<string, unknown>>))
      }
      const wierszeWiadomosci = wiadomosci
        .filter((m) => m.globalKey && m.sentDate)
        .map((m) => ({
          student_id: uczen.id,
          sender: (m.sender as string | undefined) ?? '(nieznany nadawca)',
          subject: (m.subject as string | undefined) ?? '(brak tematu)',
          content: (m.content as string | undefined) ?? '',
          sent_at: new Date(m.sentDate as string | number | Date).toISOString(),
          vulcan_key: m.globalKey as string,
        }))
      if (wierszeWiadomosci.length > 0) {
        await baza.from('vulcan_messages').upsert(wierszeWiadomosci, { onConflict: 'student_id,vulcan_key' })
      }
    } catch (e) {
      const tekst = String(e)
      // Błędy autoryzacji z biblioteki niosą w treści te nazwy klas - nie ma
      // do nich osobnych kodów HTTP do sprawdzenia inaczej.
      const sesjaNiewazna = /Unauthorized|ExpiredToken|InvalidSignature/i.test(tekst)
      if (sesjaNiewazna) {
        await baza
          .from('vulcan_connections')
          .update({ status: 'wymaga_ponownej_rejestracji', last_error: tekst })
          .eq('household_id', householdId)
        return { ok: false, blad: `Sesja Vulcan wygasła: ${tekst}` }
      }
      return { ok: false, blad: `Błąd synchronizacji ucznia ${uczen.id}: ${tekst}` }
    }
  }

  await baza.from('vulcan_connections').update({ last_error: null }).eq('household_id', householdId)
  return { ok: true }
}
```

- [ ] **Krok 3: Napisz `supabase/functions/vulcan-sync/index.ts`**

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { synchronizujDom } from '../_wspolne/vulcanSync.ts'

type Kandydat = { log_id: string; household_id: string }

Deno.serve(async (req) => {
  const baza = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const autoryzacja = req.headers.get('Authorization') ?? ''
  const kluczSerwisowy = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`

  // Wywołanie z pg_cron używa klucza service_role wprost - to jedyny sygnał,
  // po którym rozróżniamy "synchronizuj wszystkie due domy" (cron) od
  // "synchronizuj mój dom teraz" (przycisk w Mój dom, JWT zwykłego użytkownika).
  if (autoryzacja === kluczSerwisowy) {
    const { data: kandydaci, error } = await baza.rpc('vulcan_do_synchronizacji')
    if (error) {
      return new Response(JSON.stringify({ blad: error.message }), { status: 500 })
    }

    const wyniki = []
    for (const k of (kandydaci ?? []) as Kandydat[]) {
      const wynik = await synchronizujDom(baza, k.household_id)
      await baza.rpc('zamknij_sync_vulcan', { p_log: k.log_id, p_blad: wynik.blad ?? null })
      wyniki.push({ household_id: k.household_id, ...wynik })
    }
    return new Response(JSON.stringify({ przetworzono: wyniki.length, wyniki }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Wywołanie z klienta: zwykły JWT, sprawdzamy rodzica i bierzemy jego dom
  // przez klucz anon + ten sam Authorization - RLS/RPC same przefiltrują.
  const klientUzytkownika = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autoryzacja } } },
  )

  const { data: uzytkownik } = await klientUzytkownika.auth.getUser()
  if (!uzytkownik.user) {
    return new Response(JSON.stringify({ blad: 'Nieprawidłowa sesja.' }), { status: 401 })
  }

  const { data: status, error: bladStatusu } = await klientUzytkownika.rpc('status_polaczenia_vulcan')
  const wlasnyDom = status?.[0]
  if (bladStatusu || !wlasnyDom?.istnieje) {
    return new Response(JSON.stringify({ blad: 'Brak połączenia z Vulcan dla tego domu.' }), { status: 400 })
  }

  const { data: czlonek } = await baza
    .from('members')
    .select('household_id')
    .eq('user_id', uzytkownik.user.id)
    .single()

  if (!czlonek) {
    return new Response(JSON.stringify({ blad: 'Nie znaleziono domownika.' }), { status: 400 })
  }

  const wynik = await synchronizujDom(baza, czlonek.household_id)
  return new Response(JSON.stringify(wynik), {
    status: wynik.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Krok 4: Dopisz `vulcan_do_synchronizacji` i `zamknij_sync_vulcan` do schematu**

To brakujący kawałek z Zadania 1 - dodajemy tu, bo dopiero teraz widać dokładnie,
jakiego kształtu wyniku potrzebuje `vulcan-sync`. MCP `apply_migration`,
nazwa `integracja_vulcan_harmonogram_funkcje`:

```sql
-- Kandydaci do synchronizacji - ten sam wzorzec "insert...on conflict...
-- returning" co do_wyslania(): claim i wybor w jednym zapytaniu.
--
-- Dopasowanie godziny liczone przez CALKOWITOLICZBOWY "kubelek" 15-minutowy
-- (0-95 w ciagu doby), nie przez odejmowanie interwalu od `time`. Odejmowanie
-- (`teraz - 15 minut`) zawija sie o polnocy w niepoprawny sposob (dokladnie
-- ten problem opisany przy `do_wyslania` dla digest_at) - a samo porownanie
-- `between (teraz - 15 min) and teraz` na dodatek dopasowuje kazda godzine
-- lezaca DOKLADNIE na granicy kubelka w DWOCH kolejnych tikach crona (np.
-- '07:00' matchuje i o 7:00, i o 7:15), co podwaja synchronizacje. Kubelek
-- (dzielenie calkowitoliczbowe minut przez 15, niezaleznie liczone dla
-- "teraz" i dla kazdej skonfigurowanej godziny) nie ma zadnego z tych
-- problemow - kazda godzina trafia do dokladnie jednego z 96 kubelkow doby.
create or replace function public.vulcan_do_synchronizacji(p_teraz timestamptz default now())
  returns table (log_id uuid, household_id uuid)
  language sql volatile security definer set search_path = public
as $$
  with chwila as (
    select (p_teraz at time zone 'Europe/Warsaw') as lokalna
  ),
  kubelek_teraz as (
    select lokalna::date as dzien,
           extract(hour from lokalna)::int * 4 + extract(minute from lokalna)::int / 15 as kubelek
      from chwila
  ),
  kandydaci as (
    select c.household_id, kt.dzien,
           lpad((kt.kubelek / 4)::text, 2, '0') || ':' || lpad((kt.kubelek % 4 * 15)::text, 2, '0') as slot
      from public.vulcan_connections c
      cross join kubelek_teraz kt
     where c.status = 'aktywne'
       and exists (
         select 1 from unnest(c.sync_hours) g
          where split_part(g, ':', 1)::int * 4 + split_part(g, ':', 2)::int / 15 = kt.kubelek
       )
  ),
  zajete as (
    insert into public.vulcan_sync_log as l (household_id, sync_date, sync_hour)
    select k.household_id, k.dzien, k.slot from kandydaci k
    on conflict (household_id, sync_date, sync_hour) do update
       set status     = 'w_toku',
           claimed_at = now(),
           error      = null
     where (l.status = 'blad'   and l.claimed_at < now() - interval '15 minutes')
        or (l.status = 'w_toku' and l.claimed_at < now() - interval '15 minutes')
    returning l.id, l.household_id
  )
  select z.id, z.household_id from zajete z
$$;

create or replace function public.zamknij_sync_vulcan(p_log uuid, p_blad text default null)
  returns void
  language sql volatile security definer set search_path = public
as $$
  update public.vulcan_sync_log
     set status      = case when p_blad is null then 'ok' else 'blad' end,
         error       = p_blad,
         finished_at = now()
   where id = p_log
$$;

revoke execute on function public.vulcan_do_synchronizacji(timestamptz) from public, anon, authenticated;
revoke execute on function public.zamknij_sync_vulcan(uuid, text)       from public, anon, authenticated;
```

- [ ] **Krok 5: Zweryfikuj dopasowanie godzin (kubelki 15-minutowe)**

MCP `execute_sql`, wstaw tymczasowy testowy dom i połączenie, sprawdź
dopasowanie dla kilku godzin w tym samym dniu, posprzątaj:

```sql
-- Tymczasowy dom + polaczenie testowe, tylko na czas weryfikacji.
insert into public.households (id, name) values ('00000000-0000-0000-0000-000000000001', 'TEST-VULCAN-CRON');
insert into public.vulcan_connections
  (household_id, certificate, fingerprint, private_key, account, status, sync_hours)
values
  ('00000000-0000-0000-0000-000000000001', 'x', 'x', 'x', '{}'::jsonb, 'aktywne', array['07:00', '13:37', '23:50']);

-- Tik o 07:00 powinien złapać '07:00', ale NIE złapać go ponownie o 07:15.
select household_id from public.vulcan_do_synchronizacji('2026-09-14 07:00:00+02'::timestamptz);
select household_id from public.vulcan_do_synchronizacji('2026-09-14 07:15:00+02'::timestamptz);
-- '13:37' lapie sie w kubelku 13:30-13:44, czyli na tiku 13:30.
select household_id from public.vulcan_do_synchronizacji('2026-09-14 13:30:00+02'::timestamptz);
-- '23:50' - kubelek najblizej polnocy, sprawdza brak zawijania.
select household_id from public.vulcan_do_synchronizacji('2026-09-14 23:45:00+02'::timestamptz);

-- Sprzatanie.
delete from public.households where id = '00000000-0000-0000-0000-000000000001';
```

Oczekiwane: pierwsze zapytanie zwraca 1 wiersz, drugie 0 wierszy (to właśnie
błąd, który ten krok ma złapać, gdyby wrócił), trzecie i czwarte po 1
wierszu. `vulcan_sync_log` po drodze się zapełni wpisami dla tego testowego
domu - kasowanie `households` kaskadowo je usuwa.

**Uwaga na przyszłość (nie blokuje tego zadania):** dopiero przy pierwszym
realnym połączeniu użytkownika z prawdziwym kontem Vulcan można zweryfikować,
czy pola takie jak `getHomework()[].deadline`/`.key` i dokładny kształt
`getMessageBoxes()`/`getMessages()` faktycznie odpowiadają temu, co powyżej
założono z plików `.d.ts` biblioteki. Jeśli po pierwszym „Odśwież teraz"
(przycisk z Zadania 8) dane w tabelach wyglądają nieprawidłowo, sprawdź logi Edge
Function (`mcp__supabase__query_logs` albo `supabase functions logs
vulcan-sync`) i popraw mapowanie w tym pliku - to nie jest błąd planu, to
spodziewane doprecyzowanie na żywych danych.

- [ ] **Krok 6: Commit**

```bash
git add supabase/functions/_wspolne/vulcanApi.ts supabase/functions/_wspolne/vulcanSync.ts \
        supabase/functions/vulcan-sync/index.ts supabase/schema.sql
git commit -m "Integracja z Vulcan: rdzen synchronizacji i Edge Function vulcan-sync

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 4: Edge Function `vulcan-polacz` (rejestracja)

**Pliki:**
- Utworzenie: `supabase/functions/vulcan-polacz/index.ts`

**Interfejsy:**
- Konsumuje: `synchronizujDom` z `../_wspolne/vulcanSync.ts`.
- Produkuje: HTTP POST przyjmujący `{ token, symbol, pin }`, zwracający
  `{ ok: true }` albo `{ blad: string }`.

- [ ] **Krok 1: Napisz `supabase/functions/vulcan-polacz/index.ts`**

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { Keystore, VulcanHebe, registerAccount } from 'npm:vulcan-api-js@3.5.4'
import { synchronizujDom } from '../_wspolne/vulcanSync.ts'

type Cialo = { token?: string; symbol?: string; pin?: string }

function bladJson(tekst: string, status: number): Response {
  return new Response(JSON.stringify({ blad: tekst }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return bladJson('Tylko POST.', 405)

  let cialo: Cialo
  try {
    cialo = await req.json()
  } catch {
    return bladJson('Nieprawidłowy JSON.', 400)
  }

  const { token, symbol, pin } = cialo
  if (!token?.trim() || !symbol?.trim() || !pin?.trim()) {
    return bladJson('Podaj Token, Symbol i PIN.', 400)
  }

  const autoryzacja = req.headers.get('Authorization')
  if (!autoryzacja) return bladJson('Brak autoryzacji.', 401)

  const klientUzytkownika = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autoryzacja } } },
  )

  const { data: uzytkownik, error: bladUzytkownika } = await klientUzytkownika.auth.getUser()
  if (bladUzytkownika || !uzytkownik.user) return bladJson('Nieprawidłowa sesja.', 401)

  // jestem_rodzicem()/moj_dom() dzialaja przez klienta z kluczem anon +
  // Authorization uzytkownika - RLS/SECURITY DEFINER same ustala kontekst.
  const { data: jestRodzicem } = await klientUzytkownika.rpc('jestem_rodzicem')
  if (!jestRodzicem) return bladJson('Tylko rodzic może połączyć Vulcan.', 403)

  const { data: czlonek, error: bladCzlonka } = await klientUzytkownika
    .from('members')
    .select('id, household_id')
    .eq('user_id', uzytkownik.user.id)
    .single()
  if (bladCzlonka || !czlonek) return bladJson('Nie znaleziono domownika.', 400)

  let konto
  const keystore = new Keystore()
  try {
    await keystore.init('Kokpit Rodzinny', '')
    konto = await registerAccount(keystore, token.trim(), symbol.trim(), pin.trim())
  } catch (e) {
    // Biblioteka rzuca wyjatki nazwane np. InvalidPINException - nazwa klasy
    // ladowala sie tylko w stringu bledu w Deno po transpilacji z Babela,
    // wiec dopasowujemy tekstem, nie instanceof.
    const tekst = String(e)
    if (/InvalidPIN/i.test(tekst)) return bladJson('Nieprawidłowy PIN.', 400)
    if (/InvalidToken|InvalidSymbol|ExpiredToken/i.test(tekst)) {
      return bladJson('Nieprawidłowy albo wygasły Token/Symbol.', 400)
    }
    return bladJson(`Rejestracja w Vulcan nie powiodła się: ${tekst}`, 502)
  }

  const baza = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const daneKeystore = keystore.dumpToObject()
  const { error: bladZapisu } = await baza.from('vulcan_connections').upsert(
    {
      household_id: czlonek.household_id,
      connected_by_member: czlonek.id,
      certificate: daneKeystore.certificate,
      fingerprint: daneKeystore.fingerprint,
      private_key: daneKeystore.privateKey,
      firebase_token: daneKeystore.firebaseToken ?? null,
      device_model: daneKeystore.deviceModel,
      account: konto,
      status: 'aktywne',
      last_error: null,
    },
    { onConflict: 'household_id' },
  )
  if (bladZapisu) return bladJson(`Nie udało się zapisać połączenia: ${bladZapisu.message}`, 500)

  let uczniowie
  try {
    const vulcan = new VulcanHebe(keystore, konto)
    uczniowie = await vulcan.getStudents()
  } catch (e) {
    return bladJson(`Połączono, ale nie udało się wczytać uczniów: ${String(e)}`, 502)
  }

  const wierszeUczniow = uczniowie.map((u) => ({
    household_id: czlonek.household_id,
    vulcan_id: String(u.pupil.id),
    first_name: u.pupil.firstName,
    last_name: u.pupil.surname,
    student_data: u,
  }))

  if (wierszeUczniow.length > 0) {
    const { error: bladUczniow } = await baza
      .from('vulcan_students')
      .upsert(wierszeUczniow, { onConflict: 'household_id,vulcan_id' })
    if (bladUczniow) return bladJson(`Połączono, ale nie udało się zapisać uczniów: ${bladUczniow.message}`, 500)
  }

  // Pierwsza synchronizacja od razu, zeby "Szkola" nie swiecila pustka do
  // najblizszej zaplanowanej godziny - ale dopiero PO tym, jak rodzic
  // przypisze uczniow do domownikow w kolejnym kroku UI (bez przypisania
  // synchronizujDom() i tak nikogo nie przetworzy, patrz jej filtr
  // `member_id is not null`). Wywolanie tu jest wiec nieszkodliwym no-opem
  // do czasu przypisania - zostawiamy dla przyszlych polaczen, gdzie rodzic
  // zdazy przypisac przed pierwszym zaplanowanym syncem.
  void synchronizujDom(baza, czlonek.household_id)

  return new Response(JSON.stringify({ ok: true, liczbaUczniow: wierszeUczniow.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Krok 2: Commit**

```bash
git add supabase/functions/vulcan-polacz/index.ts
git commit -m "Integracja z Vulcan: Edge Function rejestracji urzadzenia

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 5: Wdrożenie — deploy, sekrety Vault, harmonogram cron

**Pliki:**
- Modyfikacja: `supabase/schema.sql` (nowa sekcja 22)
- Wdrożenie: `vulcan-polacz`, `vulcan-sync` (MCP `deploy_edge_function` albo
  `supabase functions deploy`)

To jedyne zadanie tego planu z realnymi, trudnymi do cofnięcia skutkami poza
tym repo (harmonogram cron na żywym projekcie) - wykonuj kroki po kolei,
weryfikując po każdym.

- [ ] **Krok 1: Wdróż obie funkcje**

```bash
supabase functions deploy vulcan-sync --project-ref fqviwnzinpndyprcovxw
supabase functions deploy vulcan-polacz --project-ref fqviwnzinpndyprcovxw
```

(Albo MCP `deploy_edge_function` z zawartością obu plików, jeśli CLI
niedostępne — patrz jak w spike'u z brainstormingu tej funkcji.)

- [ ] **Krok 2: Załóż sekret Vault z URL-em `vulcan-sync`**

`kokpit_klucz_serwisowy` już istnieje (z porannego podsumowania) - potrzebny
tylko nowy sekret z URL-em. MCP `execute_sql`:

```sql
select vault.create_secret(
  'https://fqviwnzinpndyprcovxw.supabase.co/functions/v1/vulcan-sync',
  'kokpit_url_funkcji_vulcan_sync');
```

- [ ] **Krok 3: Zaplanuj cron**

MCP `apply_migration`, nazwa `integracja_vulcan_harmonogram`:

```sql
-- ============================================================
--  22. Integracja z Vulcan - harmonogram
-- ============================================================

-- Sekret Vault z URL-em tej funkcji trzeba zalozyc recznie (patrz README):
--
--   select vault.create_secret(
--     'https://fqviwnzinpndyprcovxw.supabase.co/functions/v1/vulcan-sync',
--     'kokpit_url_funkcji_vulcan_sync');
--
-- `kokpit_klucz_serwisowy` jest juz zalozony (poranne podsumowanie).

select cron.schedule('vulcan-sync', '*/15 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets
                 where name = 'kokpit_url_funkcji_vulcan_sync'),
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

- [ ] **Krok 4: Dopisz sekcję 22 do `supabase/schema.sql`**

Skopiuj dokładnie tę samą treść co w Kroku 3.

- [ ] **Krok 5: Zweryfikuj harmonogram**

MCP `execute_sql`:

```sql
select jobname, schedule, active from cron.job where jobname = 'vulcan-sync';
```

Oczekiwane: jeden wiersz, `active = true`.

- [ ] **Krok 6: Commit**

```bash
git add supabase/schema.sql
git commit -m "Integracja z Vulcan: harmonogram synchronizacji co 15 minut

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 6: `src/useVulcan.ts` — dane i akcje

**Pliki:**
- Utworzenie: `src/useVulcan.ts`

**Interfejsy:**
- Konsumuje: `uczenZBazy`, `lekcjaZBazy`, `wpisZBazy`, `wiadomoscZBazy` z
  `./vulcan`; `useNaZywo` z `./useNaZywo`; `supabase` z `./lib/supabase`.
- Produkuje: `useVulcan(onBlad)` zwracający `{ status: StatusPolaczenia |
  null, uczniowie: Uczen[], lekcje: Lekcja[], wpisy: Wpis[], wiadomosci:
  Wiadomosc[], ladowanie: boolean, polacz, rozlacz, ustawGodzinySync,
  odswiezTeraz, przypiszUcznia }`.

- [ ] **Krok 1: Napisz `src/useVulcan.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { LekcjaDb, UczenDb, WiadomoscDb, WpisDb } from './lib/supabase'
import { useNaZywo } from './useNaZywo'
import {
  lekcjaZBazy,
  uczenZBazy,
  wiadomoscZBazy,
  wpisZBazy,
  type Lekcja,
  type StatusPolaczenia,
  type Uczen,
  type Wiadomosc,
  type Wpis,
} from './vulcan'

type WierszStatusu = {
  istnieje: boolean
  status: StatusPolaczenia['status']
  sync_hours: string[]
  polaczyl: string | null
  ostatni_blad: string | null
  uczniowie: Array<{ id: string; imie: string; nazwisko: string; klasa: string | null; memberId: string | null }>
}

async function komunikatBledu(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const cialo = await error.context.json()
      if (typeof cialo?.blad === 'string') return cialo.blad
    } catch {
      // odpowiedź błędu nie była JSON-em - zostajemy przy komunikacie domyślnym
    }
  }
  return error instanceof Error ? error.message : String(error)
}

/** Integracja z Vulcan: status połączenia + dane szkolne domu, odświeżane na żywo. */
export function useVulcan(onBlad: (tekst: string) => void) {
  const [status, setStatus] = useState<StatusPolaczenia | null>(null)
  const [lekcje, setLekcje] = useState<Lekcja[]>([])
  const [wpisy, setWpisy] = useState<Wpis[]>([])
  const [wiadomosci, setWiadomosci] = useState<Wiadomosc[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  const wczytaj = useCallback(async () => {
    const { data: daneStatusu, error: bladStatusu } = await supabase.rpc('status_polaczenia_vulcan')
    if (bladStatusu) {
      onBlad(`Nie udało się wczytać statusu Vulcan: ${bladStatusu.message}`)
      return
    }
    const wiersz = (daneStatusu as WierszStatusu[])[0]
    setStatus(
      wiersz
        ? {
            istnieje: wiersz.istnieje,
            status: wiersz.status,
            godzinySync: wiersz.sync_hours,
            polaczylImie: wiersz.polaczyl,
            ostatniBlad: wiersz.ostatni_blad,
            uczniowie: wiersz.uczniowie.map((u) => ({
              id: u.id,
              imie: u.imie,
              nazwisko: u.nazwisko,
              klasa: u.klasa,
              memberId: u.memberId,
            })),
          }
        : null,
    )

    const [{ data: daneLekcji, error: bladLekcji }, { data: daneWpisow, error: bladWpisow },
      { data: daneWiadomosci, error: bladWiadomosci }] = await Promise.all([
      supabase.from('vulcan_lessons').select('*'),
      supabase.from('vulcan_assignments').select('*'),
      supabase.from('vulcan_messages').select('*'),
    ])

    if (bladLekcji) onBlad(`Nie udało się wczytać planu lekcji: ${bladLekcji.message}`)
    else setLekcje(((daneLekcji ?? []) as LekcjaDb[]).map(lekcjaZBazy))

    if (bladWpisow) onBlad(`Nie udało się wczytać sprawdzianów/zadań: ${bladWpisow.message}`)
    else setWpisy(((daneWpisow ?? []) as WpisDb[]).map(wpisZBazy))

    if (bladWiadomosci) onBlad(`Nie udało się wczytać wiadomości: ${bladWiadomosci.message}`)
    else setWiadomosci(((daneWiadomosci ?? []) as WiadomoscDb[]).map(wiadomoscZBazy))
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

  useNaZywo(
    'vulcan-na-zywo',
    ['vulcan_students', 'vulcan_lessons', 'vulcan_assignments', 'vulcan_messages'],
    () => void wczytaj(),
  )

  const polacz = useCallback(
    async (token: string, symbol: string, pin: string): Promise<boolean> => {
      const { error } = await supabase.functions.invoke('vulcan-polacz', { body: { token, symbol, pin } })
      if (error) {
        onBlad(`Nie udało się połączyć z Vulcan: ${await komunikatBledu(error)}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  const rozlacz = useCallback(async (): Promise<boolean> => {
    const { error } = await supabase.rpc('rozlacz_vulcan')
    if (error) {
      onBlad(`Nie udało się rozłączyć: ${error.message}`)
      return false
    }
    await wczytaj()
    return true
  }, [wczytaj, onBlad])

  const ustawGodzinySync = useCallback(
    async (godziny: string[]): Promise<boolean> => {
      const { error } = await supabase.rpc('ustaw_godziny_sync_vulcan', { p_godziny: godziny })
      if (error) {
        onBlad(`Nie udało się zapisać godzin: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  const odswiezTeraz = useCallback(async (): Promise<boolean> => {
    const { error } = await supabase.functions.invoke('vulcan-sync', { body: {} })
    if (error) {
      onBlad(`Odświeżanie nie powiodło się: ${await komunikatBledu(error)}`)
      return false
    }
    await wczytaj()
    return true
  }, [wczytaj, onBlad])

  const przypiszUcznia = useCallback(
    async (uczenId: string, memberId: string | null): Promise<boolean> => {
      const { error } = await supabase.rpc('przypisz_ucznia_vulcan', { p_uczen: uczenId, p_member: memberId })
      if (error) {
        onBlad(`Nie udało się przypisać ucznia: ${error.message}`)
        return false
      }
      await wczytaj()
      return true
    },
    [wczytaj, onBlad],
  )

  return {
    status,
    lekcje,
    wpisy,
    wiadomosci,
    ladowanie,
    polacz,
    rozlacz,
    ustawGodzinySync,
    odswiezTeraz,
    przypiszUcznia,
  }
}
```

- [ ] **Krok 2: Sprawdź typy i lint**

```bash
npm run build
npm run lint
```

- [ ] **Krok 3: Commit**

```bash
git add src/useVulcan.ts
git commit -m "Integracja z Vulcan: hook useVulcan

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 7: Ekran `src/Szkola.tsx` i nawigacja

Ten screen budujemy PRZED sekcją w „Mój dom" (Zadanie 8) celowo: nowy plik
`Szkola.tsx` niczego nie psuje dopóki nic go nie importuje, więc da się go
w pełni podłączyć (nawigacja + `App.tsx`) w jednym zadaniu kończącym się
zielonym buildem. Rozbicie na odwrotną kolejność (nawigacja najpierw, ekran
później) zostawiłoby `App.tsx` z importem nieistniejącego jeszcze pliku
między zadaniami — złamany build na granicy commitów, którego nie da się
uniknąć bez tej kolejności.

**Pliki:**
- Utworzenie: `src/Szkola.tsx`
- Modyfikacja: `src/style/listy.css`
- Modyfikacja: `src/uklad/nawigacja.ts`
- Modyfikacja: `src/uklad/nawigacja.test.ts`
- Modyfikacja: `src/App.tsx`

**Interfejsy:**
- Konsumuje: `useVulcan` z `./useVulcan`; `pogrupujLekcjePoDniu`,
  `posortujWpisy`, `posortujWiadomosci`, typy `Lekcja`/`Wpis`/`Wiadomosc`/
  `StatusPolaczenia` z `./vulcan`; `DomownikDb` z `./lib/supabase`;
  `dlugaData` z `./dates`.
- Produkuje: `Szkola(props)` — props `{ domownicy: DomownikDb[]; status:
  StatusPolaczenia | null; lekcje: Lekcja[]; wpisy: Wpis[]; wiadomosci:
  Wiadomosc[]; ladowanie: boolean }`.

- [ ] **Krok 1: Napisz `src/Szkola.tsx`**

```tsx
import { useMemo, useState } from 'react'
import type { DomownikDb } from './lib/supabase'
import {
  pogrupujLekcjePoDniu,
  posortujWiadomosci,
  posortujWpisy,
  type Lekcja,
  type StatusPolaczenia,
  type Wiadomosc,
  type Wpis,
} from './vulcan'
import { dlugaData } from './dates'

type Props = {
  domownicy: DomownikDb[]
  status: StatusPolaczenia | null
  lekcje: Lekcja[]
  wpisy: Wpis[]
  wiadomosci: Wiadomosc[]
  ladowanie: boolean
}

type PodZakladka = 'plan' | 'wpisy' | 'wiadomosci'

const OPISY_TYPU: Record<Wpis['typ'], string> = {
  sprawdzian: 'Sprawdzian',
  zadanie_domowe: 'Zadanie domowe',
}

/** Ekran „Szkoła": plan lekcji, sprawdziany/zadania domowe i wiadomości z Vulcan. */
export function Szkola({ domownicy, status, lekcje, wpisy, wiadomosci, ladowanie }: Props) {
  const [podZakladka, setPodZakladka] = useState<PodZakladka>('plan')
  const [wybranyUczen, setWybranyUczen] = useState<string | null>(null)
  const [rozwinieta, setRozwinieta] = useState<string | null>(null)

  const uczniowie = status?.uczniowie.filter((u) => u.memberId !== null) ?? []
  const nazwaDomownika = new Map(domownicy.map((d) => [d.id, d.name]))

  const filtrUczniaId = uczniowie.length > 1 ? wybranyUczen : (uczniowie[0]?.id ?? null)

  const lekcjeWidoczne = useMemo(
    () => (filtrUczniaId ? lekcje.filter((l) => l.uczenId === filtrUczniaId) : lekcje),
    [lekcje, filtrUczniaId],
  )
  const wpisyWidoczne = useMemo(
    () => posortujWpisy(filtrUczniaId ? wpisy.filter((w) => w.uczenId === filtrUczniaId) : wpisy),
    [wpisy, filtrUczniaId],
  )
  const wiadomosciWidoczne = useMemo(
    () => posortujWiadomosci(filtrUczniaId ? wiadomosci.filter((w) => w.uczenId === filtrUczniaId) : wiadomosci),
    [wiadomosci, filtrUczniaId],
  )
  const dniPlanu = useMemo(() => pogrupujLekcjePoDniu(lekcjeWidoczne), [lekcjeWidoczne])

  function nazwaUcznia(uczenId: string): string {
    const u = uczniowie.find((x) => x.id === uczenId)
    return u ? (nazwaDomownika.get(u.memberId ?? '') ?? `${u.imie} ${u.nazwisko}`) : ''
  }

  if (ladowanie) return <p className="pusto">Wczytuję…</p>

  if (!status?.istnieje || uczniowie.length === 0) {
    return (
      <div className="szkola">
        <p className="pusto">
          Brak połączenia z Vulcan
          {uczniowie.length === 0 && status?.istnieje ? ' — żaden uczeń nie jest jeszcze przypisany.' : '.'}
          {' '}Skonfiguruj je w zakładce „Mój dom".
        </p>
      </div>
    )
  }

  return (
    <div className="szkola">
      {uczniowie.length > 1 && (
        <div className="filtry" role="group" aria-label="Pokaż dane ucznia">
          <button
            type="button"
            className={`filtr${wybranyUczen === null ? ' wlaczony' : ''}`}
            aria-pressed={wybranyUczen === null}
            onClick={() => setWybranyUczen(null)}
          >
            Wszyscy
          </button>
          {uczniowie.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`filtr${wybranyUczen === u.id ? ' wlaczony' : ''}`}
              aria-pressed={wybranyUczen === u.id}
              onClick={() => setWybranyUczen(u.id)}
            >
              {nazwaDomownika.get(u.memberId ?? '') ?? u.imie}
            </button>
          ))}
        </div>
      )}

      <div className="listy-pasek" role="tablist" aria-label="Widok szkoły">
        <button
          type="button"
          role="tab"
          aria-selected={podZakladka === 'plan'}
          className={`zakladka${podZakladka === 'plan' ? ' aktywna' : ''}`}
          onClick={() => setPodZakladka('plan')}
        >
          Plan lekcji
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={podZakladka === 'wpisy'}
          className={`zakladka${podZakladka === 'wpisy' ? ' aktywna' : ''}`}
          onClick={() => setPodZakladka('wpisy')}
        >
          Sprawdziany i zadania
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={podZakladka === 'wiadomosci'}
          className={`zakladka${podZakladka === 'wiadomosci' ? ' aktywna' : ''}`}
          onClick={() => setPodZakladka('wiadomosci')}
        >
          Wiadomości
        </button>
      </div>

      {podZakladka === 'plan' &&
        (dniPlanu.size === 0 ? (
          <p className="pusto">Brak lekcji w tym tygodniu.</p>
        ) : (
          <div className="plan-lekcji">
            {[...dniPlanu.entries()].map(([dzien, lekcjeDnia]) => (
              <section key={dzien} className="dzien-planu">
                <h3 className="dzien-planu-naglowek">{dlugaData(new Date(`${dzien}T12:00:00`))}</h3>
                <ul className="lista-lekcji">
                  {lekcjeDnia.map((l) => (
                    <li key={l.id} className={`lekcja${l.zmieniona ? ' lekcja-zmieniona' : ''}`}>
                      <span className="lekcja-godziny">
                        {l.od}–{l.do}
                      </span>
                      <span className="lekcja-przedmiot">
                        {l.przedmiot}
                        {uczniowie.length > 1 && !filtrUczniaId && (
                          <span className="meta"> · {nazwaUcznia(l.uczenId)}</span>
                        )}
                      </span>
                      {(l.nauczyciel || l.sala) && (
                        <span className="lekcja-detale">
                          {[l.nauczyciel, l.sala].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {l.zmieniona && <span className="lekcja-zmiana-etykieta">{l.opisZmiany ?? 'Zmiana'}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}

      {podZakladka === 'wpisy' &&
        (wpisyWidoczne.length === 0 ? (
          <p className="pusto">Brak sprawdzianów i zadań domowych.</p>
        ) : (
          <div className="tabela-terminow-kontener">
            <table className="tabela-terminow">
              <thead>
                <tr>
                  <th>Data</th>
                  {!filtrUczniaId && uczniowie.length > 1 && <th>Uczeń</th>}
                  <th>Przedmiot</th>
                  <th>Typ</th>
                  <th>Opis</th>
                </tr>
              </thead>
              <tbody>
                {wpisyWidoczne.map((w) => (
                  <tr key={w.id}>
                    <td>{dlugaData(new Date(`${w.data}T12:00:00`))}</td>
                    {!filtrUczniaId && uczniowie.length > 1 && <td>{nazwaUcznia(w.uczenId)}</td>}
                    <td className="tytul-terminu">{w.przedmiot}</td>
                    <td>
                      <span className={`status-terminu ${w.typ === 'sprawdzian' ? 'status-przeterminowany' : 'status-aktywny'}`}>
                        {OPISY_TYPU[w.typ]}
                      </span>
                    </td>
                    <td className="opis-terminu">{w.opis ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {podZakladka === 'wiadomosci' &&
        (wiadomosciWidoczne.length === 0 ? (
          <p className="pusto">Brak wiadomości.</p>
        ) : (
          <ul className="lista-wiadomosci-vulcan">
            {wiadomosciWidoczne.map((w) => (
              <li key={w.id} className="wiadomosc-vulcan">
                <button
                  type="button"
                  className="wiadomosc-vulcan-naglowek"
                  aria-expanded={rozwinieta === w.id}
                  onClick={() => setRozwinieta(rozwinieta === w.id ? null : w.id)}
                >
                  <span className="wiadomosc-vulcan-nadawca">{w.nadawca}</span>
                  <span className="wiadomosc-vulcan-temat">{w.temat}</span>
                  <span className="meta">
                    {dlugaData(new Date(w.data))},{' '}
                    {new Date(w.data).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
                {rozwinieta === w.id && <p className="wiadomosc-vulcan-tresc">{w.tresc}</p>}
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
```

- [ ] **Krok 2: Style w `src/style/listy.css`**

Dopisz na końcu pliku:

```css
/* --- Ekran "Szkoła" --- */

.szkola {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.plan-lekcji {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dzien-planu-naglowek {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
}

.lista-lekcji {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lekcja {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--kreska);
  border-radius: 10px;
  background: var(--karta);
  font-size: 14px;
}

.lekcja-zmieniona {
  border-color: var(--blad);
  background: var(--blad-tlo);
}

.lekcja-godziny {
  flex-shrink: 0;
  min-width: 92px;
  font-variant-numeric: tabular-nums;
  color: var(--tekst-drugi);
}

.lekcja-przedmiot {
  font-weight: 600;
}

.lekcja-detale {
  color: var(--tekst-drugi);
  font-size: 13px;
}

.lekcja-zmiana-etykieta {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--blad);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.lista-wiadomosci-vulcan {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wiadomosc-vulcan {
  border: 1px solid var(--kreska);
  border-radius: 10px;
  background: var(--karta);
  overflow: hidden;
}

.wiadomosc-vulcan-naglowek {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.wiadomosc-vulcan-nadawca {
  font-weight: 600;
}

.wiadomosc-vulcan-temat {
  flex: 1;
  min-width: 0;
  color: var(--tekst-drugi);
}

.wiadomosc-vulcan-tresc {
  margin: 0;
  padding: 0 12px 12px;
  white-space: pre-wrap;
  font-size: 14px;
}
```

- [ ] **Krok 3: Zaktualizuj `src/uklad/nawigacja.ts`**

```ts
export type Ekran = 'kalendarz' | 'zakupy' | 'tablica' | 'terminy' | 'szkola' | 'dom'

export const EKRANY: Ekran[] = ['kalendarz', 'zakupy', 'tablica', 'terminy', 'szkola', 'dom']

export const TYTULY: Record<Ekran, string> = {
  kalendarz: 'Kalendarz',
  zakupy: 'Zakupy',
  tablica: 'Tablica',
  terminy: 'Terminy',
  szkola: 'Szkoła',
  dom: 'Mój dom',
}
```

W `etykietaDodania` dodaj `case 'szkola': return null` (ekran wyłącznie do
odczytu, bez formularza dodawania) tuż przed `case 'dom':`.

- [ ] **Krok 4: Znajdź i zaktualizuj test w `src/uklad/nawigacja.test.ts`**

Przeczytaj plik, znajdź test iterujący po `EKRANY`/sprawdzający
`etykietaDodania` dla każdego ekranu, dopisz przypadek dla `'szkola'`
(oczekiwany wynik `null`) analogicznie do istniejącego dla `'dom'`.

- [ ] **Krok 5: Podepnij w `src/App.tsx`**

Dodaj import:

```ts
import { Szkola } from './Szkola'
import { useVulcan } from './useVulcan'
```

W ciele `App`, obok `const osoby = useDomownicy(setBlad)`, dodaj:

```ts
const vulcan = useVulcan(setBlad)
```

W bloku `tresc` dodaj gałąź `ekran === 'szkola'` tuż przed `ekran === 'dom'`:

```tsx
) : ekran === 'szkola' ? (
  <Szkola
    domownicy={osoby.domownicy}
    status={vulcan.status}
    lekcje={vulcan.lekcje}
    wpisy={vulcan.wpisy}
    wiadomosci={vulcan.wiadomosci}
    ladowanie={vulcan.ladowanie}
  />
) : ekran === 'dom' ? (
```

Wywołanie `<MojDom>` na razie zostaje bez zmian — prop `vulcan` dochodzi do
niego dopiero w Zadaniu 8, razem z typem, który go opisuje.

- [ ] **Krok 6: Testy, lint, build**

```bash
npm test -- --run
npm run lint
npm run build
```

Wszystko musi przejść — `Szkola.tsx` istnieje i jest w pełni podłączony,
`MojDom` nie został jeszcze ruszony, więc nic nie zostaje w połowie zmiany.

- [ ] **Krok 7: Ręczna weryfikacja w przeglądarce**

Uruchom `npm run dev`, wejdź w nową zakładkę „Szkoła" — bez połączenia z
Vulcan powinien pokazać się komunikat „Brak połączenia z Vulcan” z
odnośnikiem do „Mój dom" (ta ostatnia sekcja pojawi się dopiero w Zadaniu 8).

- [ ] **Krok 8: Commit**

```bash
git add src/Szkola.tsx src/style/listy.css src/uklad/nawigacja.ts \
        src/uklad/nawigacja.test.ts src/App.tsx
git commit -m "Integracja z Vulcan: ekran Szkola i podpiecie nawigacji

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 8: `MojDom.tsx` — sekcja połączenia z Vulcan

**Pliki:**
- Modyfikacja: `src/MojDom.tsx`
- Modyfikacja: `src/style/formularze.css`

**Interfejsy:**
- Konsumuje: `StatusPolaczenia`, `MAKS_GODZIN_SYNC`, `bladGodzinySync` z
  `./vulcan`; zwrot `useVulcan()` (Zadanie 6).
- Produkuje: `<PolaczenieVulcan>` — nowa sekcja `karta` w ekranie „Mój dom".

- [ ] **Krok 1: Dodaj `vulcan={vulcan}` do wywołania `<MojDom>` w `src/App.tsx`**

Zmienna `vulcan` (z `useVulcan(setBlad)`) już istnieje w `App` od Zadania 7 —
tu tylko dochodzi jako nowy prop do wywołania `<MojDom>`, które Zadanie 7
celowo zostawiło bez zmian. Po tej zmianie całe wywołanie wygląda tak:

```tsx
<MojDom
  domownicy={osoby.domownicy}
  ladowanie={osoby.ladowanie}
  jestemRodzicem={jestemRodzicem}
  mojeId={profil.id}
  proponowanyKolor={osoby.proponowanyKolor}
  onDodaj={osoby.dodaj}
  onZmien={osoby.zmien}
  onUsun={usunDomownika}
  onUstawPowiadomienia={osoby.ustawPowiadomienia}
  onPolaczTelegram={osoby.polaczTelegram}
  vulcan={vulcan}
  dodawanie={trybDodawania('dom')}
/>
```

- [ ] **Krok 2: Dodaj prop `vulcan` do `MojDom` i wyrenderuj sekcję**

W `src/MojDom.tsx` dopisz import:

```ts
import { bladGodzinySync, MAKS_GODZIN_SYNC, type StatusPolaczenia } from './vulcan'
```

Rozszerz `Props` o:

```ts
vulcan: {
  status: StatusPolaczenia | null
  ladowanie: boolean
  polacz: (token: string, symbol: string, pin: string) => Promise<boolean>
  rozlacz: () => Promise<boolean>
  ustawGodzinySync: (godziny: string[]) => Promise<boolean>
  odswiezTeraz: () => Promise<boolean>
  przypiszUcznia: (uczenId: string, memberId: string | null) => Promise<boolean>
}
```

W ciele `MojDom`, obok `<BotTelegram ... />`, dodaj:

```tsx
{jestemRodzicem && <PolaczenieVulcan vulcan={vulcan} domownicy={domownicy} />}
```

(Sekcja widoczna tylko rodzicowi — zgodnie z decyzją „kto konfiguruje".)

- [ ] **Krok 3: Napisz komponent `PolaczenieVulcan`**

Dodaj na końcu pliku `src/MojDom.tsx`, obok `BotTelegram`:

```tsx
type PolaczenieVulcanProps = {
  vulcan: Props['vulcan']
  domownicy: DomownikDb[]
}

/**
 * Połączenie z dziennikiem Vulcan - rejestracja Tokenem/Symbolem/PIN-em,
 * przypisanie uczniów do domowników, godziny synchronizacji, rozłączenie.
 * Widoczne tylko rodzicowi (patrz warunek w `MojDom`).
 */
function PolaczenieVulcan({ vulcan, domownicy }: PolaczenieVulcanProps) {
  const [token, setToken] = useState('')
  const [symbol, setSymbol] = useState('')
  const [pin, setPin] = useState('')
  const [laczenie, setLaczenie] = useState(false)
  const [bladFormularza, setBladFormularza] = useState<string | null>(null)
  const [godziny, setGodziny] = useState<string[]>([])
  const [zapisywanieGodzin, setZapisywanieGodzin] = useState(false)
  const [odswiezanie, setOdswiezanie] = useState(false)

  const status = vulcan.status

  useEffect(() => {
    if (status) setGodziny(status.godzinySync)
  }, [status])

  async function polacz(e: React.FormEvent) {
    e.preventDefault()
    setBladFormularza(null)
    setLaczenie(true)
    const ok = await vulcan.polacz(token.trim(), symbol.trim(), pin.trim())
    setLaczenie(false)
    if (ok) {
      setToken('')
      setSymbol('')
      setPin('')
    }
  }

  async function zapiszGodziny() {
    const blad = bladGodzinySync(godziny)
    if (blad) {
      setBladFormularza(blad)
      return
    }
    setBladFormularza(null)
    setZapisywanieGodzin(true)
    await vulcan.ustawGodzinySync(godziny)
    setZapisywanieGodzin(false)
  }

  if (vulcan.ladowanie) return null

  return (
    <section className="karta">
      <h2 className="panel-tytul">Vulcan (dziennik elektroniczny)</h2>

      {!status?.istnieje ? (
        <>
          <p className="panel-dzien">
            Połącz konto Vulcan rodzica, żeby widzieć plan lekcji, sprawdziany,
            zadania domowe i wiadomości dzieci w zakładce „Szkoła". Token,
            Symbol i PIN wygenerujesz w oficjalnej aplikacji Vulcan (Dostęp
            Mobilny) — są jednorazowe.
          </p>
          <form className="formularz formularz-vulcan" onSubmit={(e) => void polacz(e)}>
            <label htmlFor="vulcan-token">Token</label>
            <input id="vulcan-token" value={token} onChange={(e) => setToken(e.target.value)} maxLength={10} />

            <label htmlFor="vulcan-symbol">Symbol</label>
            <input id="vulcan-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} />

            <label htmlFor="vulcan-pin">PIN</label>
            <input id="vulcan-pin" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={8} />

            {bladFormularza && (
              <p className="blad" role="alert">
                {bladFormularza}
              </p>
            )}

            <button type="submit" disabled={laczenie || !token.trim() || !symbol.trim() || !pin.trim()}>
              {laczenie ? 'Łączę…' : 'Połącz'}
            </button>
          </form>
        </>
      ) : (
        <>
          {status.status === 'wymaga_ponownej_rejestracji' ? (
            <p className="blad" role="alert">
              Połączenie wygasło ({status.ostatniBlad ?? 'nieznany błąd'}) — połącz się ponownie Tokenem/Symbolem/PIN-em.
            </p>
          ) : (
            <p className="polaczono">✓ Połączono{status.polaczylImie ? ` przez ${status.polaczylImie}` : ''}</p>
          )}

          {status.uczniowie.length > 0 && (
            <ul className="lista-uczniow-vulcan">
              {status.uczniowie.map((u) => (
                <li key={u.id}>
                  <span className="nazwa">
                    {u.imie} {u.nazwisko}
                    {u.klasa && <span className="meta"> · {u.klasa}</span>}
                  </span>
                  <select
                    aria-label={`Przypisz ${u.imie} ${u.nazwisko} do domownika`}
                    value={u.memberId ?? ''}
                    onChange={(e) => void vulcan.przypiszUcznia(u.id, e.target.value || null)}
                  >
                    <option value="">Nie pokazuj</option>
                    {domownicy.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}

          <div className="godziny-sync">
            <span className="etykieta-koloru">Godziny synchronizacji (maks. {MAKS_GODZIN_SYNC})</span>
            {godziny.map((g, i) => (
              <div key={i} className="godzina-sync-wiersz">
                <input
                  type="time"
                  value={g}
                  onChange={(e) => setGodziny(godziny.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button type="button" className="usun" onClick={() => setGodziny(godziny.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            {godziny.length < MAKS_GODZIN_SYNC && (
              <button type="button" className="drobny" onClick={() => setGodziny([...godziny, '07:00'])}>
                + Dodaj godzinę
              </button>
            )}
            {bladFormularza && (
              <p className="blad" role="alert">
                {bladFormularza}
              </p>
            )}
            <button type="button" onClick={() => void zapiszGodziny()} disabled={zapisywanieGodzin}>
              {zapisywanieGodzin ? 'Zapisuję…' : 'Zapisz godziny'}
            </button>
          </div>

          <div className="akcje-vulcan">
            <button
              type="button"
              className="drugi"
              disabled={odswiezanie}
              onClick={async () => {
                setOdswiezanie(true)
                await vulcan.odswiezTeraz()
                setOdswiezanie(false)
              }}
            >
              {odswiezanie ? 'Odświeżam…' : 'Odśwież teraz'}
            </button>
            <button type="button" className="usuwanie" onClick={() => void vulcan.rozlacz()}>
              Rozłącz
            </button>
          </div>
        </>
      )}
    </section>
  )
}
```

Dopisz `useEffect` do importu z `'react'` na górze pliku (obok istniejącego
`useState`).

- [ ] **Krok 4: Style w `src/style/formularze.css`**

Dopisz na końcu pliku:

```css
/* --- Połączenie z Vulcan --- */

.formularz-vulcan {
  max-width: 320px;
}

.lista-uczniow-vulcan {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lista-uczniow-vulcan li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--kreska);
  border-radius: 10px;
}

.godziny-sync {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 14px 0;
  padding: 12px;
  border: 1px solid var(--kreska);
  border-radius: 10px;
}

.godzina-sync-wiersz {
  display: flex;
  align-items: center;
  gap: 8px;
}

.akcje-vulcan {
  display: flex;
  gap: 8px;
}
```

- [ ] **Krok 5: Testy, lint, build**

```bash
npm test -- --run
npm run lint
npm run build
```

Wszystko musi przejść — to ostatni kawałek integracji, cała funkcja jest
teraz kompletna i spięta w jeden działający build.

- [ ] **Krok 6: Ręczna weryfikacja w przeglądarce**

Uruchom `npm run dev`, zaloguj się jako rodzic, wejdź w „Mój dom", sprawdź że
sekcja Vulcan się renderuje (formularz Token/Symbol/PIN, bez połączenia).
Bez prawdziwego konta Vulcan nie da się przetestować realnego połączenia —
to pierwsza rzecz do zrobienia przez użytkownika po scaleniu (patrz README,
Zadanie 9).

- [ ] **Krok 7: Commit**

```bash
git add src/App.tsx src/MojDom.tsx src/style/formularze.css
git commit -m "Integracja z Vulcan: sekcja polaczenia w Moj dom

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 9: README

**Pliki:**
- Modyfikacja: `README.md`

- [ ] **Krok 1: Dodaj sekcję „## Integracja z Vulcan"**

Wzoruj się na sekcji „## Bot na Telegramie" (opis funkcji) i sekcji 6 w
instrukcji setupu (kroki instalacji). Treść:

```markdown
## Integracja z Vulcan

Rodzic może połączyć konto Vulcan (dziennik elektroniczny UONET+) w ekranie
„Mój dom" — Token, Symbol i PIN generuje się w oficjalnej aplikacji Vulcan
(Dostęp Mobilny), są jednorazowe. Jedno połączenie obejmuje wszystkie dzieci
widoczne na tym koncie; każde trzeba osobno przypisać do domownika, żeby
pojawiło się w zakładce „Szkoła".

Zakładka „Szkoła" pokazuje (tylko do odczytu — Kokpit nic nie wysyła z
powrotem do Vulcan): plan lekcji na bieżący tydzień ze zmianami/zastępstwami
wyróżnionymi kolorem, sprawdziany i zadania domowe, oraz wiadomości od
nauczycieli. Widoczna dla każdego domownika z kontem.

Dane odświeżają się automatycznie w tle w skonfigurowanych godzinach (do 3
dziennie, ustawiane w „Mój dom" przez rodzica) oraz na żądanie przyciskiem
„Odśwież teraz". Jeśli połączenie wygaśnie (certyfikat/token nieważny),
Kokpit pokaże to w „Mój dom" — trzeba połączyć się ponownie nowym
Tokenem/Symbolem/PIN-em.

Poza zakresem: oceny, frekwencja, odpowiadanie na wiadomości z Kokpitu.
```

- [ ] **Krok 2: Dodaj sekcję setupu (numer kolejny po „Bot na Telegramie")**

```markdown
7. **Integracja z Vulcan** (opcjonalne — bez tego reszta aplikacji działa):

   - SQL Editor: załóż sekret Vault z URL-em funkcji `vulcan-sync`
     (`kokpit_klucz_serwisowy` już istnieje z porannego podsumowania):

     ```sql
     select vault.create_secret(
       'https://TWOJ-PROJEKT.supabase.co/functions/v1/vulcan-sync',
       'kokpit_url_funkcji_vulcan_sync');
     ```

   - Wdróż obie funkcje: `supabase functions deploy vulcan-sync` i
     `supabase functions deploy vulcan-polacz`.
   - Rodzic łączy konto w „Mój dom" Tokenem/Symbolem/PIN-em z oficjalnej
     aplikacji Vulcan, potem przypisuje uczniów do domowników.
```

- [ ] **Krok 3: Zaktualizuj tabelę „Struktura"**

Dodaj wiersze dla `src/vulcan.ts`, `src/useVulcan.ts`, `src/Szkola.tsx`
analogicznie do istniejących wierszy `src/terminy.ts`/`src/useTerminy.ts`/
`src/WazneTerminy.tsx`.

- [ ] **Krok 4: Commit**

```bash
git add README.md
git commit -m "Dokumentacja integracji z Vulcan

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
