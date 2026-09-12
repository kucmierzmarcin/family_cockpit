-- ============================================================
--  Kokpit Rodzinny - pełny schemat bazy
--  Wklej całość w panelu Supabase: SQL Editor -> New query -> Run.
--  Potem załóż konto i dom w samej aplikacji - start.sql jest potrzebny tylko
--  wtedy, gdy w bazie leżą dane sprzed wprowadzenia logowania.
-- ============================================================

-- 1. Dom, do którego należą wszystkie dane.
create table if not exists public.households (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now()
);

-- 2. Domownicy. Jedna tabela łączy profil w kalendarzu (imię, kolor)
--    z przynależnością do domu (rola, konto).
--    Puste `user_id` i `email` = osoba bez konta, np. małe dziecko.
create table if not exists public.members (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        references public.households(id) on delete cascade,
  name         text        not null,
  color        text        not null,             -- id koloru z palety, patrz src/kolory.ts
  role         text        not null default 'domownik',
  user_id      uuid        references auth.users(id) on delete set null,
  email        text,
  created_at   timestamptz not null default now(),
  constraint members_role_check check (role in ('rodzic', 'domownik', 'dziecko'))
);

-- Jedno konto = jedna osoba; jeden adres = jedna osoba.
create unique index if not exists members_user_id_key
  on public.members (user_id) where user_id is not null;
create unique index if not exists members_email_key
  on public.members (lower(email)) where email is not null;
create index if not exists members_household_idx
  on public.members (household_id);

-- 3. Wydarzenia kalendarza.
--    `starts_at` i `ends_at` to `timestamp` BEZ strefy - aplikacja działa
--    w jednej strefie, a timestamptz przy wydarzeniach całodniowych daje
--    przesunięcia o godzinę. Koniec jest WYŁĄCZNY: wydarzenie trwa do tej
--    chwili, ale jej nie obejmuje, więc wyjazd 9-11 września zapisuje się
--    jako 09-09 00:00 -> 09-12 00:00.
--    `series_id` łączy wystąpienia jednego powtarzającego się wydarzenia.
create table if not exists public.events (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null,
  starts_at    timestamp   not null,
  ends_at      timestamp   not null,
  all_day      boolean     not null default false,
  series_id    uuid,
  household_id uuid        references public.households(id) on delete cascade,
  created_by   uuid        references public.members(id)    on delete set null,
  created_at   timestamptz not null default now(),
  constraint events_zakres_check check (ends_at > starts_at)
);

create index if not exists events_household_idx on public.events (household_id);
create index if not exists events_zakres_idx     on public.events (household_id, starts_at, ends_at);
create index if not exists events_series_idx     on public.events (series_id) where series_id is not null;

-- 3a. Kto bierze udział w wydarzeniu. Pusto = wydarzenie wspólne.
--     Usunięcie domownika kasuje jego przypisania, ale zostawia wydarzenia.
create table if not exists public.event_members (
  event_id  uuid not null references public.events(id)  on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  primary key (event_id, member_id)
);

create index if not exists event_members_member_idx
  on public.event_members (member_id);

-- 4. Funkcje pomocnicze. SECURITY DEFINER omija RLS w środku, dzięki czemu
--    polityka na `members` może pytać o `members` bez wpadania w rekurencję.
create or replace function public.moj_dom() returns uuid
  language sql stable security definer set search_path = public
as $$
  select household_id from public.members where user_id = auth.uid() limit 1
$$;

create or replace function public.ja_jako_member() returns uuid
  language sql stable security definer set search_path = public
as $$
  select id from public.members where user_id = auth.uid() limit 1
$$;

create or replace function public.jestem_rodzicem() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.members where user_id = auth.uid() and role = 'rodzic'
  )
$$;

-- Aplikacja nie musi pamiętać o tych kolumnach - baza wypełni je sama.
alter table public.members alter column household_id set default public.moj_dom();
alter table public.events  alter column household_id set default public.moj_dom();
alter table public.events  alter column created_by   set default public.ja_jako_member();

-- 5. Powiązanie konta z osobą. Aplikacja używa klucza publishable i nie ma
--    prawa czytać auth.users, więc dopasowanie po adresie robi baza.
--    Wołane po każdym zalogowaniu; przy istniejącym powiązaniu nic nie zmienia.
create or replace function public.polacz_moje_konto() returns uuid
  language plpgsql volatile security definer set search_path = public
as $$
declare
  znaleziony uuid;
begin
  update public.members
     set user_id = auth.uid()
   where user_id is null
     and email is not null
     and lower(email) = lower(auth.email())
  returning id into znaleziony;

  return znaleziony;
end
$$;

-- Zakłada dom dla zalogowanego i czyni go w nim rodzicem. SECURITY DEFINER jest
-- konieczne: polityka wstawiania do `members` wymaga roli rodzica, a świeże
-- konto jeszcze nigdzie nim nie jest. Jedno konto = jeden dom.
create or replace function public.zaloz_dom(nazwa text, imie text)
  returns uuid
  language plpgsql volatile security definer set search_path = public
as $$
declare
  nowy_dom      uuid;
  nowy_domownik uuid;
begin
  if auth.uid() is null then
    raise exception 'Trzeba być zalogowanym.';
  end if;

  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'To konto należy już do domu.';
  end if;

  insert into public.households (name)
  values (coalesce(nullif(btrim(nazwa), ''), 'Nasz dom'))
  returning id into nowy_dom;

  insert into public.members (household_id, name, color, role, user_id, email)
  values (
    nowy_dom,
    coalesce(nullif(btrim(imie), ''), split_part(auth.email(), '@', 1)),
    'fiolet',
    'rodzic',
    auth.uid(),
    auth.email()
  )
  returning id into nowy_domownik;

  return nowy_domownik;
end
$$;

-- Czy jestem przypisany do tego wydarzenia? SECURITY DEFINER przerywa
-- rekurencję: polityka na `events` pyta o `event_members`, którego własna
-- polityka pyta o `events`.
create or replace function public.jestem_przypisany(p_event uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.event_members em
     where em.event_id = p_event
       and em.member_id = public.ja_jako_member()
  )
$$;

create or replace function public.jestem_autorem(p_event uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.events e
     where e.id = p_event
       and e.household_id = public.moj_dom()
       and e.created_by = public.ja_jako_member()
  )
$$;

create or replace function public.wydarzenie_z_mojego_domu(p_event uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.events e
     where e.id = p_event
       and e.household_id = public.moj_dom()
  )
$$;

grant execute on function public.jestem_przypisany(uuid)        to authenticated;
grant execute on function public.jestem_autorem(uuid)           to authenticated;
grant execute on function public.wydarzenie_z_mojego_domu(uuid) to authenticated;

grant execute on function public.moj_dom()           to authenticated;
grant execute on function public.ja_jako_member()    to authenticated;
grant execute on function public.jestem_rodzicem()   to authenticated;
grant execute on function public.polacz_moje_konto() to authenticated;
grant execute on function public.zaloz_dom(text, text) to authenticated;

-- 6. Ochrona wierszy. Od tej chwili nic nie jest dostępne bez reguł poniżej,
--    a niezalogowany (rola "anon") nie dostaje żadnej.
alter table public.households    enable row level security;
alter table public.members       enable row level security;
alter table public.events        enable row level security;
alter table public.event_members enable row level security;

-- 7. Dom: widzi go tylko jego mieszkaniec, zmienia tylko rodzic.
drop policy if exists "Dom - odczyt" on public.households;
create policy "Dom - odczyt" on public.households
  for select to authenticated
  using (id = public.moj_dom());

drop policy if exists "Dom - zmiana" on public.households;
create policy "Dom - zmiana" on public.households
  for update to authenticated
  using (id = public.moj_dom() and public.jestem_rodzicem())
  with check (id = public.moj_dom());

-- 8. Domownicy: wszyscy z domu widzą listę, zarządza nią rodzic.
drop policy if exists "Domownicy - odczyt" on public.members;
create policy "Domownicy - odczyt" on public.members
  for select to authenticated
  using (household_id = public.moj_dom());

drop policy if exists "Domownicy - dodawanie" on public.members;
create policy "Domownicy - dodawanie" on public.members
  for insert to authenticated
  with check (household_id = public.moj_dom() and public.jestem_rodzicem());

drop policy if exists "Domownicy - zmiana" on public.members;
create policy "Domownicy - zmiana" on public.members
  for update to authenticated
  using (household_id = public.moj_dom() and public.jestem_rodzicem())
  with check (household_id = public.moj_dom());

drop policy if exists "Domownicy - usuwanie" on public.members;
create policy "Domownicy - usuwanie" on public.members
  for delete to authenticated
  using (household_id = public.moj_dom() and public.jestem_rodzicem());

-- 9. Wydarzenia: cały dom widzi i dodaje; zmienia i usuwa autor,
--    osoba przypisana albo rodzic.
drop policy if exists "Wydarzenia - odczyt" on public.events;
create policy "Wydarzenia - odczyt" on public.events
  for select to authenticated
  using (household_id = public.moj_dom());

drop policy if exists "Wydarzenia - dodawanie" on public.events;
create policy "Wydarzenia - dodawanie" on public.events
  for insert to authenticated
  with check (household_id = public.moj_dom());

drop policy if exists "Wydarzenia - zmiana" on public.events;
create policy "Wydarzenia - zmiana" on public.events
  for update to authenticated
  using (
    household_id = public.moj_dom()
    and (
      created_by = public.ja_jako_member()
      or public.jestem_przypisany(id)
      or public.jestem_rodzicem()
    )
  )
  with check (household_id = public.moj_dom());

drop policy if exists "Wydarzenia - usuwanie" on public.events;
create policy "Wydarzenia - usuwanie" on public.events
  for delete to authenticated
  using (
    household_id = public.moj_dom()
    and (
      created_by = public.ja_jako_member()
      or public.jestem_przypisany(id)
      or public.jestem_rodzicem()
    )
  );

-- 10. Przypisania osób: widzi je cały dom, zmienia autor wpisu albo rodzic.
--     Bez tego ograniczenia dziecko mogłoby dopisać się do dowolnego wydarzenia.
drop policy if exists "Przypisania - odczyt" on public.event_members;
create policy "Przypisania - odczyt" on public.event_members
  for select to authenticated
  using (public.wydarzenie_z_mojego_domu(event_id));

drop policy if exists "Przypisania - dodawanie" on public.event_members;
create policy "Przypisania - dodawanie" on public.event_members
  for insert to authenticated
  with check (
    public.wydarzenie_z_mojego_domu(event_id)
    and (public.jestem_autorem(event_id) or public.jestem_rodzicem())
  );

drop policy if exists "Przypisania - usuwanie" on public.event_members;
create policy "Przypisania - usuwanie" on public.event_members
  for delete to authenticated
  using (
    public.wydarzenie_z_mojego_domu(event_id)
    and (public.jestem_autorem(event_id) or public.jestem_rodzicem())
  );

-- ============================================================
--  11. Listy zakupów
-- ============================================================

create table if not exists public.shopping_lists (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        references public.households(id) on delete cascade,
  name         text        not null,
  created_at   timestamptz not null default now()
);

-- Usunięcie listy kasuje jej pozycje - pozycja bez listy nie ma sensu.
create table if not exists public.shopping_items (
  id         uuid        primary key default gen_random_uuid(),
  list_id    uuid        not null references public.shopping_lists(id) on delete cascade,
  name       text        not null,
  quantity   text,                        -- tekst: "2 l", "10 szt.", "pół kg"
  done       boolean     not null default false,
  created_by uuid        references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists shopping_lists_household_idx on public.shopping_lists (household_id);
create index if not exists shopping_items_list_idx      on public.shopping_items (list_id);

-- Dwie listy o tej samej nazwie w jednym domu to zawsze pomyłka.
create unique index if not exists shopping_lists_nazwa_key
  on public.shopping_lists (household_id, lower(name));

alter table public.shopping_lists alter column household_id set default public.moj_dom();
alter table public.shopping_items alter column created_by   set default public.ja_jako_member();

-- Pozycje należą do domu przez swoją listę, więc polityka musi sięgnąć poziom
-- wyżej. SECURITY DEFINER - ten sam wzorzec co przy members i event_members.
create or replace function public.lista_z_mojego_domu(p_lista uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.shopping_lists l
     where l.id = p_lista and l.household_id = public.moj_dom()
  )
$$;

create or replace function public.moja_pozycja(p_pozycja uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.shopping_items i
     where i.id = p_pozycja and i.created_by = public.ja_jako_member()
  )
$$;

-- Zakłada domyślne listy, jeśli dom nie ma jeszcze żadnej.
-- SECURITY DEFINER, bo wstawianie list wymaga roli rodzica, a pierwsze wejście
-- na ekran może wykonać dziecko.
-- Blokada doradcza szereguje równoległe wywołania: bez niej dwa naraz (React
-- w trybie deweloperskim montuje efekty dwukrotnie) zobaczą pustą tabelę
-- i założą listy podwójnie.
create or replace function public.zapewnij_listy_zakupow() returns void
  language plpgsql volatile security definer set search_path = public
as $$
declare
  dom uuid;
begin
  dom := public.moj_dom();
  if dom is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('listy_zakupow:' || dom::text));

  if exists (select 1 from public.shopping_lists where household_id = dom) then
    return;
  end if;

  insert into public.shopping_lists (household_id, name)
  values (dom, 'Spożywcze'), (dom, 'Apteka'), (dom, 'Dom')
  on conflict do nothing;
end
$$;

grant execute on function public.lista_z_mojego_domu(uuid)   to authenticated;
grant execute on function public.moja_pozycja(uuid)          to authenticated;
grant execute on function public.zapewnij_listy_zakupow()    to authenticated;

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

-- Listy: widzi cały dom, zarządza rodzic.
drop policy if exists "Listy - odczyt" on public.shopping_lists;
create policy "Listy - odczyt" on public.shopping_lists
  for select to authenticated
  using (household_id = public.moj_dom());

drop policy if exists "Listy - dodawanie" on public.shopping_lists;
create policy "Listy - dodawanie" on public.shopping_lists
  for insert to authenticated
  with check (household_id = public.moj_dom() and public.jestem_rodzicem());

drop policy if exists "Listy - zmiana" on public.shopping_lists;
create policy "Listy - zmiana" on public.shopping_lists
  for update to authenticated
  using (household_id = public.moj_dom() and public.jestem_rodzicem())
  with check (household_id = public.moj_dom());

drop policy if exists "Listy - usuwanie" on public.shopping_lists;
create policy "Listy - usuwanie" on public.shopping_lists
  for delete to authenticated
  using (household_id = public.moj_dom() and public.jestem_rodzicem());

-- Pozycje: każdy z domu dopisuje i odhacza; usuwa autor albo rodzic.
drop policy if exists "Pozycje - odczyt" on public.shopping_items;
create policy "Pozycje - odczyt" on public.shopping_items
  for select to authenticated
  using (public.lista_z_mojego_domu(list_id));

drop policy if exists "Pozycje - dodawanie" on public.shopping_items;
create policy "Pozycje - dodawanie" on public.shopping_items
  for insert to authenticated
  with check (public.lista_z_mojego_domu(list_id));

drop policy if exists "Pozycje - zmiana" on public.shopping_items;
create policy "Pozycje - zmiana" on public.shopping_items
  for update to authenticated
  using (public.lista_z_mojego_domu(list_id))
  with check (public.lista_z_mojego_domu(list_id));

drop policy if exists "Pozycje - usuwanie" on public.shopping_items;
create policy "Pozycje - usuwanie" on public.shopping_items
  for delete to authenticated
  using (
    public.lista_z_mojego_domu(list_id)
    and (public.moja_pozycja(id) or public.jestem_rodzicem())
  );

-- ============================================================
--  12. Tablica - notatki rodzinne
-- ============================================================

create table if not exists public.notes (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        references public.households(id) on delete cascade,
  content      text        not null,
  pinned       boolean     not null default false,
  created_by   uuid        references public.members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists notes_household_idx on public.notes (household_id);

alter table public.notes alter column household_id set default public.moj_dom();
alter table public.notes alter column created_by   set default public.ja_jako_member();

create or replace function public.moja_notatka(p_notatka uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.notes n
     where n.id = p_notatka and n.created_by = public.ja_jako_member()
  )
$$;

grant execute on function public.moja_notatka(uuid) to authenticated;

alter table public.notes enable row level security;

-- Notatki widzi i dopisuje cały dom. Przypinać może każdy - to porządkowanie
-- wspólnej tablicy, nie ingerencja w cudzą treść. Usuwa autor albo rodzic.
drop policy if exists "Notatki - odczyt" on public.notes;
create policy "Notatki - odczyt" on public.notes
  for select to authenticated
  using (household_id = public.moj_dom());

drop policy if exists "Notatki - dodawanie" on public.notes;
create policy "Notatki - dodawanie" on public.notes
  for insert to authenticated
  with check (household_id = public.moj_dom());

drop policy if exists "Notatki - zmiana" on public.notes;
create policy "Notatki - zmiana" on public.notes
  for update to authenticated
  using (household_id = public.moj_dom())
  with check (household_id = public.moj_dom());

drop policy if exists "Notatki - usuwanie" on public.notes;
create policy "Notatki - usuwanie" on public.notes
  for delete to authenticated
  using (
    household_id = public.moj_dom()
    and (public.moja_notatka(id) or public.jestem_rodzicem())
  );

-- ============================================================
--  13. Podgląd na żywo
-- ============================================================
-- Bez tego zmiany innych domowników nie docierają bez odświeżenia strony.
-- Uruchom tylko raz - powtórne dodanie tabeli do publikacji zgłosi błąd.
alter publication supabase_realtime add table public.shopping_lists;
alter publication supabase_realtime add table public.shopping_items;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.event_members;
alter publication supabase_realtime add table public.members;

-- ============================================================
--  14. Poranne podsumowanie - ustawienia domownika
-- ============================================================

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

-- Godziny wysyłki tylko 05:00-10:00 (patrz ograniczenia globalne planu). Bez tego
-- `do_wyslania` zawija się przy północy dla digest_at w ostatnich 2h doby - ten
-- constraint czyni to niemożliwe na poziomie danych, nie tylko przez UI (które i tak
-- jeszcze nie istnieje).
alter table public.members
  add constraint members_digest_at_zakres
  check (digest_at >= '05:00' and digest_at <= '10:00');

-- ============================================================
--  15. Poranne podsumowanie - dziennik wysyłek
-- ============================================================

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

-- ============================================================
--  16. Poranne podsumowanie - dane dla domu
-- ============================================================

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

-- ============================================================
--  17. Poranne podsumowanie - harmonogram
-- ============================================================

-- Sekrety Vault (URL funkcji i klucz service_role) trzeba zalozyc recznie,
-- klucz serwisowy nie moze trafic do repo:
--
--   select vault.create_secret(
--     'https://fqviwnzinpndyprcovxw.supabase.co/functions/v1/poranne-podsumowanie',
--     'kokpit_url_funkcji');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'kokpit_klucz_serwisowy');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Co 15 minut, przy godzinach wybieranych co 30 - zapas na spozniony przebieg.
-- Dziennie 96 wywolan, w wiekszosci konczacych sie pustym `do_wyslania()`.
--
-- timeout_milliseconds=30000: domyslne 5s pg_net bylo za krotkie, obserwowane
-- na live timeouty przy pustych wywolaniach (cold start Edge Function). Bez
-- tego padniete polaczenie moze zostawic wpis w digest_log jako "w_toku" i
-- doprowadzic do podwojnej wysylki po ponownym zajeciu po 15 minutach.
select cron.schedule('poranne-podsumowanie', '*/15 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets
                 where name = 'kokpit_url_funkcji'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' ||
                   (select decrypted_secret from vault.decrypted_secrets
                     where name = 'kokpit_klucz_serwisowy')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);

-- ============================================================
--  18. Bot na Telegramie
-- ============================================================

alter table public.members
  add column if not exists telegram_chat_id bigint;

create unique index if not exists members_telegram_chat_id_key
  on public.members (telegram_chat_id) where telegram_chat_id is not null;

-- Kody parowania - jednorazowe, krotkotrwale. RLS wlaczone, zero polityk:
-- to sprawa service_role i security definer funkcji, nie przegladarki.
create table if not exists public.telegram_codes (
  code       text primary key,
  member_id  uuid not null references public.members(id) on delete cascade,
  expires_at timestamptz not null
);

create index if not exists telegram_codes_member_idx on public.telegram_codes (member_id);

alter table public.telegram_codes enable row level security;

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

  delete from public.telegram_codes where member_id = wlasny_member;

  -- 6 znakow z alfabetu bez znakow latwych do pomylenia (0/O, 1/I/l).
  -- floor(), nie samo ::int - Postgres zaokragla przy rzutowaniu float->int,
  -- wiec (random()*31)::int moglo dac 31 (indeks 32), poza alfabetem.
  nowy_kod := (
    select string_agg(znak, '')
      from (
        select substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ',
                       floor(random() * 31)::int + 1, 1) as znak
          from generate_series(1, 6)
      ) losowe
  );

  insert into public.telegram_codes (code, member_id, expires_at)
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
    from public.telegram_codes
   where code = p_kod and expires_at > now();

  if znaleziony_member is null then
    return false;
  end if;

  update public.members set telegram_chat_id = p_chat_id
   where id = znaleziony_member;

  delete from public.telegram_codes where code = p_kod;

  return true;
end
$$;

revoke execute on function public.polacz_telegram(text, bigint) from public, anon, authenticated;

-- Szkic wydarzenia czekajacy na potwierdzenie "tak"/"nie" - jeden na osobe,
-- nowa propozycja nadpisuje poprzednia (member_id jest kluczem glownym).
create table if not exists public.telegram_drafts (
  member_id   uuid primary key references public.members(id) on delete cascade,
  event_data  jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.telegram_drafts enable row level security;

-- Dane potrzebne botowi do obslugi wiadomosci - jedno zapytanie zamiast
-- dwoch osobnych (member + household). `rola` dodana dla dodawania
-- zakupow/notatek - trzeba wiedziec, czy piszacy moze zalozyc nowa liste.
create or replace function public.domownik_po_czacie(p_chat_id bigint)
  returns table (member_id uuid, household_id uuid, imie text, rola text)
  language sql stable security definer set search_path = public
as $$
  select m.id, m.household_id, m.name, m.role
    from public.members m
   where m.telegram_chat_id = p_chat_id
$$;

revoke execute on function public.domownik_po_czacie(bigint) from public, anon, authenticated;

-- Zapis wydarzenia zaproponowanego przez bota. p_member NIE jest tu
-- weryfikowany wzgledem zadnej sesji - ufa mu tylko Edge Function, ktora
-- wczesniej ustalila je przez domownik_po_czacie(). household_id bierzemy
-- z domownika, nie z argumentu, zeby nie dalo sie podac cudzego domu.
-- p_powtarzanie/p_do_kiedy: opcjonalna seria, ten sam algorytm co seria()
-- w src/czas.ts (co tydzien/dwa tygodnie/miesiac, dzien miesiaca zachowany
-- z pominieciem nieistniejacych dat jak 31 lutego, limit 400 wystapien).
-- Zwraca liczbe utworzonych wystapien (1 dla zwyklego wydarzenia) -
-- poprzedni zwracany typ (uuid) nigdy nie byl uzywany przez wolajacy kod.
create or replace function public.dodaj_wydarzenie_bota(
  p_member      uuid,
  p_tytul       text,
  p_poczatek    timestamp,
  p_koniec      timestamp,
  p_calodniowe  boolean,
  p_osoby       uuid[],
  p_powtarzanie text default null, -- null | 'tydzien' | 'dwa-tygodnie' | 'miesiac'
  p_do_kiedy    date default null  -- wymagane, gdy p_powtarzanie nie jest null
) returns int
  language plpgsql volatile security definer set search_path = public
as $$
declare
  wlasny_dom uuid;
  nowe_id uuid;
  seria_id uuid;
  dlugosc interval;
  i int := 0;
  poczatek_i timestamp;
  koniec_i timestamp;
  utworzone int := 0;
begin
  select household_id into wlasny_dom from public.members where id = p_member;
  if wlasny_dom is null then
    raise exception 'Nieznany domownik.';
  end if;

  if p_powtarzanie is null then
    insert into public.events (title, starts_at, ends_at, all_day, household_id, created_by)
    values (p_tytul, p_poczatek, p_koniec, p_calodniowe, wlasny_dom, p_member)
    returning id into nowe_id;

    if p_osoby is not null and array_length(p_osoby, 1) > 0 then
      insert into public.event_members (event_id, member_id)
      select nowe_id, unnest(p_osoby);
    end if;

    return 1;
  end if;

  seria_id := gen_random_uuid();
  dlugosc := p_koniec - p_poczatek;

  loop
    poczatek_i := case p_powtarzanie
      when 'miesiac' then p_poczatek + (i || ' months')::interval
      when 'dwa-tygodnie' then p_poczatek + (i * 14 || ' days')::interval
      else p_poczatek + (i * 7 || ' days')::interval
    end;

    exit when poczatek_i::date > p_do_kiedy or i >= 400;

    if p_powtarzanie = 'miesiac' and extract(day from poczatek_i) != extract(day from p_poczatek) then
      i := i + 1;
      continue;
    end if;

    koniec_i := poczatek_i + dlugosc;

    insert into public.events (title, starts_at, ends_at, all_day, household_id, created_by, series_id)
    values (p_tytul, poczatek_i, koniec_i, p_calodniowe, wlasny_dom, p_member, seria_id)
    returning id into nowe_id;

    if p_osoby is not null and array_length(p_osoby, 1) > 0 then
      insert into public.event_members (event_id, member_id)
      select nowe_id, unnest(p_osoby);
    end if;

    utworzone := utworzone + 1;
    i := i + 1;
  end loop;

  return utworzone;
end
$$;

revoke execute on function public.dodaj_wydarzenie_bota(uuid, text, timestamp, timestamp, boolean, uuid[], text, date)
  from public, anon, authenticated;

-- "Dzisiaj" liczone w bazie, w strefie Europe/Warsaw - nie w Deno (kod
-- Edge Function biegnie w UTC, wiec new Date() dawal zla date w oknie
-- 00:00-02:00 czasu warszawskiego). Zwykla funkcja, bez security definer -
-- nie dotyka tabel, nic wrazliwego nie ujawnia.
create or replace function public.dzisiaj_w_warszawie()
  returns date
  language sql stable
as $$
  select (now() at time zone 'Europe/Warsaw')::date
$$;

-- Dodanie pozycji do ISTNIEJACEJ listy zakupow. p_lista_id musi naleziec do
-- domu wyliczonego z p_member - jedyne miejsce, ktore ufa Edge Function.
create or replace function public.dodaj_pozycje_zakupow_bota(
  p_member   uuid,
  p_lista_id uuid,
  p_nazwa    text,
  p_ilosc    text
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

  if not exists (
    select 1 from public.shopping_lists where id = p_lista_id and household_id = wlasny_dom
  ) then
    raise exception 'Lista nie nalezy do tego domu.';
  end if;

  insert into public.shopping_items (list_id, name, quantity, created_by)
  values (p_lista_id, p_nazwa, p_ilosc, p_member)
  returning id into nowe_id;

  return nowe_id;
end
$$;

revoke execute on function public.dodaj_pozycje_zakupow_bota(uuid, uuid, text, text)
  from public, anon, authenticated;

-- Zaklada nowa liste zakupow - tylko dla rodzica, mirror reguly RLS
-- "Listy - dodawanie" (tam public.jestem_rodzicem() liczy sie z auth.uid();
-- tu Edge Function nie ma sesji, wiec sprawdzamy role p_member wprost).
create or replace function public.zaloz_liste_zakupow_bota(p_member uuid, p_nazwa text)
  returns uuid
  language plpgsql volatile security definer set search_path = public
as $$
declare
  wlasny_dom uuid;
  jest_rodzicem boolean;
  nowa_lista uuid;
begin
  select household_id, (role = 'rodzic') into wlasny_dom, jest_rodzicem
    from public.members where id = p_member;

  if wlasny_dom is null then
    raise exception 'Nieznany domownik.';
  end if;
  if not jest_rodzicem then
    raise exception 'Tylko rodzic moze zalozyc nowa liste zakupow.';
  end if;

  insert into public.shopping_lists (household_id, name)
  values (wlasny_dom, p_nazwa)
  returning id into nowa_lista;

  return nowa_lista;
end
$$;

revoke execute on function public.zaloz_liste_zakupow_bota(uuid, text)
  from public, anon, authenticated;

-- Dodanie notatki na tablice - kazdy domownik moze, tak jak w aplikacji.
create or replace function public.dodaj_notatke_bota(
  p_member    uuid,
  p_tresc     text,
  p_przypieta boolean
) returns uuid
  language plpgsql volatile security definer set search_path = public
as $$
declare
  wlasny_dom uuid;
  nowa_id uuid;
begin
  select household_id into wlasny_dom from public.members where id = p_member;
  if wlasny_dom is null then
    raise exception 'Nieznany domownik.';
  end if;

  insert into public.notes (household_id, content, pinned, created_by)
  values (wlasny_dom, p_tresc, coalesce(p_przypieta, false), p_member)
  returning id into nowa_id;

  return nowa_id;
end
$$;

revoke execute on function public.dodaj_notatke_bota(uuid, text, boolean)
  from public, anon, authenticated;

-- Szuka wydarzen do usuniecia po fragmencie tytulu, opcjonalnie w danym dniu.
-- Zwraca liste kandydatow - Edge Function decyduje, co dalej (0/1/wiele).
-- Kolumna nazwana event_id (nie "id") - "id" jako nazwa zwracanej kolumny
-- kolidowalo z odwolaniem do members.id w tresci funkcji (blad 42702).
create or replace function public.znajdz_wydarzenia_bota(
  p_member uuid,
  p_fraza  text,
  p_dzien  date default null
) returns table (event_id uuid, title text, starts_at timestamp, ends_at timestamp, all_day boolean)
  language plpgsql stable security definer set search_path = public
as $$
declare
  wlasny_dom uuid;
begin
  select m.household_id into wlasny_dom from public.members m where m.id = p_member;
  if wlasny_dom is null then
    raise exception 'Nieznany domownik.';
  end if;

  return query
    select e.id, e.title, e.starts_at, e.ends_at, e.all_day
      from public.events e
     where e.household_id = wlasny_dom
       and e.title ilike '%' || p_fraza || '%'
       and (
         p_dzien is null
         or (e.starts_at < (p_dzien + 1)::timestamp and e.ends_at > p_dzien::timestamp)
       )
     order by e.starts_at
     limit 10;
end
$$;

revoke execute on function public.znajdz_wydarzenia_bota(uuid, text, date)
  from public, anon, authenticated;

-- Usuwa wydarzenie, jesli p_member ma do tego prawo - dokladnie te same
-- reguly co RLS "Wydarzenia - usuwanie": autor, przypisana osoba, albo rodzic.
-- Zwraca false (nie rzuca wyjatku) gdy brak uprawnien, zeby Edge Function
-- mogla dac uzytkownikowi zrozumiala, nie-techniczna odpowiedz.
create or replace function public.usun_wydarzenie_bota(p_member uuid, p_event uuid)
  returns boolean
  language plpgsql volatile security definer set search_path = public
as $$
declare
  wlasny_dom uuid;
  jest_rodzicem boolean;
  event_dom uuid;
  event_tworca uuid;
  jest_przypisany boolean;
begin
  select household_id, (role = 'rodzic') into wlasny_dom, jest_rodzicem
    from public.members where id = p_member;
  if wlasny_dom is null then
    raise exception 'Nieznany domownik.';
  end if;

  select household_id, created_by into event_dom, event_tworca
    from public.events where id = p_event;
  if event_dom is null or event_dom != wlasny_dom then
    raise exception 'Nieznane wydarzenie.';
  end if;

  select exists(
    select 1 from public.event_members where event_id = p_event and member_id = p_member
  ) into jest_przypisany;

  if not (event_tworca = p_member or jest_przypisany or jest_rodzicem) then
    return false;
  end if;

  delete from public.events where id = p_event;
  return true;
end
$$;

revoke execute on function public.usun_wydarzenie_bota(uuid, uuid)
  from public, anon, authenticated;

-- Edytuje wydarzenie, jesli p_member ma do tego prawo - mirror RLS "Wydarzenia
-- - zmiana" (autor, przypisana osoba, rodzic). Zmiana przypisanych osob
-- (p_osoby != null) wymaga wezszych uprawnien - mirror RLS "Przypisania -
-- dodawanie/usuwanie" (tylko autor albo rodzic) - inaczej cala edycja jest
-- odrzucana. Edycja zawsze odrywa wydarzenie od serii cyklicznej
-- (series_id := null), zgodnie z decyzja: edytujemy tylko to wystapienie.
-- Zwraca false (nie rzuca wyjatku) gdy brak uprawnien, tak jak usun_wydarzenie_bota.
create or replace function public.edytuj_wydarzenie_bota(
  p_member     uuid,
  p_event      uuid,
  p_tytul      text,
  p_poczatek   timestamp,
  p_koniec     timestamp,
  p_calodniowe boolean,
  p_osoby      uuid[] default null -- null = nie zmieniaj przypisanych osob
) returns boolean
  language plpgsql volatile security definer set search_path = public
as $$
declare
  wlasny_dom uuid;
  jest_rodzicem boolean;
  event_dom uuid;
  event_tworca uuid;
  jest_przypisany boolean;
begin
  select household_id, (role = 'rodzic') into wlasny_dom, jest_rodzicem
    from public.members where id = p_member;
  if wlasny_dom is null then
    raise exception 'Nieznany domownik.';
  end if;

  select household_id, created_by into event_dom, event_tworca
    from public.events where id = p_event;
  if event_dom is null or event_dom != wlasny_dom then
    raise exception 'Nieznane wydarzenie.';
  end if;

  select exists(
    select 1 from public.event_members where event_id = p_event and member_id = p_member
  ) into jest_przypisany;

  if not (event_tworca = p_member or jest_przypisany or jest_rodzicem) then
    return false;
  end if;

  if p_osoby is not null and not (event_tworca = p_member or jest_rodzicem) then
    return false;
  end if;

  update public.events
     set title     = p_tytul,
         starts_at = p_poczatek,
         ends_at   = p_koniec,
         all_day   = p_calodniowe,
         series_id = null
   where id = p_event;

  if p_osoby is not null then
    delete from public.event_members where event_id = p_event;
    if array_length(p_osoby, 1) > 0 then
      insert into public.event_members (event_id, member_id)
      select p_event, unnest(p_osoby);
    end if;
  end if;

  return true;
end
$$;

revoke execute on function public.edytuj_wydarzenie_bota(uuid, uuid, text, timestamp, timestamp, boolean, uuid[])
  from public, anon, authenticated;
