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
--    `member_id` puste = wydarzenie wspólne, nieprzypisane nikomu.
--    `on delete set null`: usunięcie osoby nie kasuje jej wydarzeń.
create table if not exists public.events (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null,
  event_date   date        not null,
  event_time   time,
  member_id    uuid        references public.members(id)    on delete set null,
  household_id uuid        references public.households(id) on delete cascade,
  created_by   uuid        references public.members(id)    on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists events_event_date_idx on public.events (event_date);
create index if not exists events_member_id_idx  on public.events (member_id);
create index if not exists events_household_idx  on public.events (household_id);

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

grant execute on function public.moj_dom()           to authenticated;
grant execute on function public.ja_jako_member()    to authenticated;
grant execute on function public.jestem_rodzicem()   to authenticated;
grant execute on function public.polacz_moje_konto() to authenticated;
grant execute on function public.zaloz_dom(text, text) to authenticated;

-- 6. Ochrona wierszy. Od tej chwili nic nie jest dostępne bez reguł poniżej,
--    a niezalogowany (rola "anon") nie dostaje żadnej.
alter table public.households enable row level security;
alter table public.members    enable row level security;
alter table public.events     enable row level security;

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
      or member_id = public.ja_jako_member()
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
      or member_id = public.ja_jako_member()
      or public.jestem_rodzicem()
    )
  );
