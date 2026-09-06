-- ============================================================
--  Kokpit Rodzinny - tabela wydarzeń kalendarza
--  Wklej całość w panelu Supabase: SQL Editor -> New query -> Run
-- ============================================================

-- 1. Tabela, w której lądują wszystkie wydarzenia.
create table if not exists public.events (
  id         uuid        primary key default gen_random_uuid(),
  title      text        not null,
  event_date date        not null,
  event_time time,
  created_at timestamptz not null default now()
);

-- 2. Skorowidz - dzięki niemu wyszukiwanie po dacie jest szybkie.
create index if not exists events_event_date_idx
  on public.events (event_date);

-- 3. Włączamy ochronę wierszy. Od tej chwili nic nie jest dostępne,
--    dopóki nie dopiszemy reguł poniżej.
alter table public.events enable row level security;

-- 4. Reguły dostępu dla aplikacji (klucz publishable = rola "anon").
drop policy if exists "Odczyt wydarzen" on public.events;
create policy "Odczyt wydarzen"
  on public.events
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Dodawanie wydarzen" on public.events;
create policy "Dodawanie wydarzen"
  on public.events
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Usuwanie wydarzen" on public.events;
create policy "Usuwanie wydarzen"
  on public.events
  for delete
  to anon, authenticated
  using (true);
