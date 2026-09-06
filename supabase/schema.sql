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
