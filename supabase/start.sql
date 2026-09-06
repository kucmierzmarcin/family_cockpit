-- ============================================================
--  Kokpit Rodzinny - skrypt startowy pierwszego domu
--
--  Uruchom RAZ, po zastosowaniu schema.sql i po założeniu sobie
--  konta w panelu: Authentication -> Users -> Add user.
--
--  Wklej całość w panelu Supabase: SQL Editor -> New query -> Run.
--  Można go puścić ponownie - nie zdubluje danych.
-- ============================================================

do $$
declare
  -- ---------- ZMIEŃ TE TRZY LINIE ----------
  nazwa_domu    text := 'Nasz dom';
  imie_rodzica  text := 'Marcin';
  email_rodzica text := 'wpisz@swoj-adres.pl';  -- ten sam, na który założyłeś konto
  -- -----------------------------------------

  dom     uuid;
  rodzic  uuid;
  ile_os  int;
  ile_wyd int;
begin
  if email_rodzica = 'wpisz@swoj-adres.pl' then
    raise exception 'Najpierw wpisz swój adres e-mail w zmiennej email_rodzica.';
  end if;

  -- 1. Dom. Jeśli już jakiś jest, używamy go zamiast zakładać drugi.
  select id into dom from public.households order by created_at limit 1;

  if dom is null then
    insert into public.households (name) values (nazwa_domu) returning id into dom;
    raise notice 'Założono dom "%".', nazwa_domu;
  else
    raise notice 'Dom już istnieje - dopisuję do niego.';
  end if;

  -- 2. Osoby i wydarzenia sprzed tej zmiany trafiają do tego domu.
  update public.members set household_id = dom where household_id is null;
  get diagnostics ile_os = row_count;

  update public.events set household_id = dom where household_id is null;
  get diagnostics ile_wyd = row_count;

  raise notice 'Przypisano do domu: % osób, % wydarzeń.', ile_os, ile_wyd;

  -- 3. Rodzic. Jeśli osoba o tym imieniu już jest na liście, awansujemy ją
  --    zamiast zakładać duplikat.
  select id into rodzic
    from public.members
   where household_id = dom
     and lower(name) = lower(imie_rodzica)
   limit 1;

  if rodzic is null then
    insert into public.members (household_id, name, color, role, email)
    values (dom, imie_rodzica, 'fiolet', 'rodzic', email_rodzica)
    returning id into rodzic;
    raise notice 'Dodano rodzica "%" (%).', imie_rodzica, email_rodzica;
  else
    update public.members
       set role  = 'rodzic',
           email = email_rodzica
     where id = rodzic;
    raise notice 'Osoba "%" jest teraz rodzicem (%).', imie_rodzica, email_rodzica;
  end if;

  -- 4. Wydarzenia bez autora przypisujemy rodzicowi, żeby dało się je usuwać.
  update public.events set created_by = rodzic where created_by is null;

  raise notice 'Gotowe. Zaloguj się w aplikacji adresem %.', email_rodzica;
end
$$;

-- Podgląd efektu:
select h.name as dom, m.name as osoba, m.role as rola,
       coalesce(m.email, '-') as email,
       case when m.user_id is null then 'czeka na logowanie' else 'połączone' end as konto
  from public.members m
  join public.households h on h.id = m.household_id
 order by m.created_at;
