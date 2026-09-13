# Integracja z Vulcan (UONET+)

Data: 2026-09-13
Dotyczy: Kokpit Rodzinny, nowa zakładka „Szkoła" (poza numeracją #0–#8 planu budowy)

## Po co

Dom korzysta z dziennika elektronicznego Vulcan (UONET+) dla dzieci. Plan
lekcji, sprawdziany, zadania domowe i wiadomości od nauczycieli żyją dziś
wyłącznie w osobnej aplikacji Vulcan — user chce mieć je w Kokpicie, obok
reszty rodzinnych informacji, bez logowania się gdzie indziej.

To read-only integracja: Kokpit pokazuje dane z Vulcan, ale nic do Vulcan nie
wysyła (żadnych odpowiedzi na wiadomości, żadnej edycji). Świadomie poza
zakresem tej wersji: **oceny** i **frekwencja** — tylko plan lekcji,
sprawdziany/zadania domowe i wiadomości.

## Architektura

Vulcan nie ma oficjalnego API — używamy nieoficjalnej biblioteki
[`vulcan-api-js`](https://www.npmjs.com/package/vulcan-api-js) (npm,
TypeScript, bazująca na tej samej logice co referencyjne
[`kapi2289/vulcan-api`](https://github.com/kapi2289/vulcan-api) w Pythonie).
Import `npm:vulcan-api-js@3.5.4` w Supabase Edge Function (Deno) — **potwierdzone
spike'em**: biblioteka ładuje się poprawnie, `Keystore.init()` (RSA przez
`node-forge`) działa bez problemu w środowisku Edge Function.

Cała logika Vulcan żyje w Edge Functions, wywoływanych przez `pg_cron` —
dokładnie ten sam wzorzec co poranne podsumowanie (`_wspolne/`, `pg_cron` co
15 min, funkcja SQL wybierająca kandydatów). Przeglądarka nigdy nie rozmawia
z Vulcan bezpośrednio — czyta wyłącznie z naszych tabel Supabase (RLS,
Realtime), jak wszystko inne w apce.

**Ryzyko do świadomości**: opublikowana wersja npm (`3.5.4`) nie była
aktualizowana od połowy 2024, mimo że kod źródłowy na GitHub jest rozwijany
dalej (ostatni commit luty 2026). Jeśli Vulcan zmieni protokół mobilny, a npm
przestanie działać — plan B to import z konkretnego commita na GitHubie
(Deno umie importować `.ts` po URL) zamiast czekać na nowe wydanie npm. Nie
budujemy tego z góry — tylko odnotowujemy jako znaną ścieżkę wyjścia.

## Model danych

```sql
-- Jedno połączenie na dom. Poświadczenia dostępne WYŁĄCZNIE przez
-- service_role (Edge Function) - RLS bez żadnej polityki, jak digest_log.
create table public.vulcan_polaczenia (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  polaczyl_member_id uuid references public.members(id) on delete set null,
  certificate       text not null,
  fingerprint       text not null,
  private_key       text not null,
  firebase_token    text,
  device_model      text not null default 'Kokpit Rodzinny',
  status            text not null default 'aktywne',
  godziny_sync      text[] not null default '{}',  -- np. {'06:00','13:00','19:00'}
  ostatni_blad      text,
  created_at        timestamptz not null default now(),
  constraint vulcan_polaczenia_status_check check (status in ('aktywne', 'wymaga_ponownej_rejestracji')),
  unique (household_id)
);

-- Uczniowie zwróceni przez konto Vulcan, z opcjonalnym powiązaniem do domownika.
create table public.vulcan_uczniowie (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  vulcan_id      text not null,       -- id ucznia po stronie Vulcan (Student.id)
  imie           text not null,
  nazwisko       text not null,
  klasa          text,
  member_id      uuid references public.members(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (household_id, vulcan_id)
);

create table public.vulcan_lekcje (
  id           uuid primary key default gen_random_uuid(),
  uczen_id     uuid not null references public.vulcan_uczniowie(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  data         date not null,
  od           time not null,
  do_godz      time not null,
  przedmiot    text not null,
  nauczyciel   text,
  sala         text,
  zmieniona    boolean not null default false,
  odwolana     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.vulcan_wpisy (
  id           uuid primary key default gen_random_uuid(),
  uczen_id     uuid not null references public.vulcan_uczniowie(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  typ          text not null,   -- 'sprawdzian' | 'zadanie_domowe'
  data         date not null,
  przedmiot    text not null,
  opis         text,
  created_at   timestamptz not null default now(),
  constraint vulcan_wpisy_typ_check check (typ in ('sprawdzian', 'zadanie_domowe'))
);

create table public.vulcan_wiadomosci (
  id           uuid primary key default gen_random_uuid(),
  uczen_id     uuid not null references public.vulcan_uczniowie(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  nadawca      text not null,
  temat        text not null,
  tresc        text not null,
  data         timestamptz not null,
  created_at   timestamptz not null default now()
);

-- Anty-duplikacja syncu w tym samym oknie 15-minutowym - jak digest_log.
create table public.vulcan_sync_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  dzien        date not null,
  godzina      text not null,   -- ktora z godziny_sync zostala obsluzona
  status       text not null default 'w_toku',
  claimed_at   timestamptz not null default now(),
  finished_at  timestamptz,
  error        text,
  constraint vulcan_sync_log_status_check check (status in ('w_toku', 'ok', 'blad')),
  unique (household_id, dzien, godzina)
);
```

RLS:
- `vulcan_polaczenia`, `vulcan_sync_log`: RLS włączone, **zero polityk** —
  tylko `service_role`. Rodzic w UI widzi jedynie pochodną (status,
  `godziny_sync`, `polaczyl_member_id`) przez dedykowaną funkcję
  `security definer`, nigdy przez bezpośredni `select` na tabeli.
- `vulcan_uczniowie`, `vulcan_lekcje`, `vulcan_wpisy`, `vulcan_wiadomosci`:
  `select` dla całego domu (`household_id = moj_dom()`), zero polityk
  `insert`/`update`/`delete` dla `authenticated` — dane wpływają wyłącznie z
  Edge Function. Wyjątek: `update member_id` na `vulcan_uczniowie` dostępny
  rodzicowi (`jestem_rodzicem()`) — to jedyna edycja z poziomu klienta w
  całej integracji (przypisywanie ucznia do domownika).

## Rejestracja i mapowanie uczniów

Nowa sekcja w „Mój dom", widoczna dla wszystkich, edytowalna tylko przez
rodzica (`jestem_rodzicem()`):

1. Formularz Token / Symbol / PIN (rodzic generuje je w oficjalnej appce
   Vulcan — „Dostęp Mobilny", jednorazowe). Submit woła Edge Function
   **synchronicznie** (nie przez cron): `Keystore.init()` →
   `registerAccount(keystore, token, symbol, pin)` → zapis do
   `vulcan_polaczenia` → `getStudents()` → upsert do `vulcan_uczniowie`.
   Błędy biblioteki (`InvalidPINException`, `InvalidTokenException`,
   `InvalidSymbolException`) trafiają przez istniejący `onBlad`.
2. Lista uczniów z select „Przypisz do domownika" (albo „Nie pokazuj") -
   uczeń bez `member_id` jest w bazie, ale niewidoczny w „Szkole".
3. Status połączenia + przyciski „Rozłącz" (kasuje `vulcan_polaczenia`,
   `on delete cascade` czyści resztę) i „Odśwież teraz" (ręczne wywołanie
   `vulcan-sync` dla tego domu, pomijając harmonogram).
4. Edytor `godziny_sync` — do 3 time-pickerów, zapis bezpośrednio na
   `vulcan_polaczenia` (rodzic, przez dedykowaną funkcję `security definer`
   analogiczną do zapisu godziny porannego podsumowania).

Token/Symbol/PIN nigdzie nie są zapisywane — tylko wynik rejestracji
(keystore).

## Synchronizacja

- Nowa funkcja SQL `vulcan_do_synchronizacji(p_teraz timestamptz)` - ten sam
  wzorzec `insert ... on conflict do update ... returning` co
  `do_wyslania()`: znajduje domy, których aktualna godzina (strefa
  `Europe/Warsaw`, zaokrąglona do 15 min) pasuje do jednej z ich
  `godziny_sync`, claimuje wpis w `vulcan_sync_log` (dedupe na
  `household_id, dzien, godzina`), zwraca listę do przetworzenia.
- Edge Function `vulcan-sync`, wołana przez `pg_cron` co 15 min: dla
  każdego zwróconego domu ładuje `Keystore` z `vulcan_polaczenia`, dla
  każdego ucznia z `member_id is not null` pobiera dane i zapisuje je do
  właściwych tabel — sposób różni się per endpoint, bo biblioteka nie daje
  tu jednego wspólnego kształtu (patrz „Uwaga implementacyjna" niżej):
  - `getLessons(dateFrom, dateTo)` / `getChangedLessons(...)` na bieżący
    tydzień — zakres dat w naszej tabeli jest w pełni zastępowany
    (delete+insert dla tego ucznia i tygodnia), nie dopisywany.
  - `getExams(lastSync)` — biblioteka zwraca zmiany od ostatniej
    synchronizacji (ten sam wzorzec co `getGrades(lastSync)`); `lastSync`
    trzymamy per uczeń, upsert po kluczu (uczen, data, przedmiot, opis).
  - `getHomework()` — bez parametrów, zwraca aktualny zestaw zadań; przy
    każdym syncu w całości zastępujemy zadania domowe tego ucznia.
  - `getMessageBoxes()` + `getMessages(box)` — upsert po kluczu (uczen,
    nadawca, temat, data); brak parametru okna czasowego, więc traktujemy
    zwrot jako pełny zestaw do zsynchronizowania.

  Na końcu zamyka wpis w `vulcan_sync_log` (`ok`/`blad`).
- Błąd sesji (`UnauthorizedCertificateException`, `ExpiredTokenException`)
  → `vulcan_polaczenia.status = 'wymaga_ponownej_rejestracji'` +
  `ostatni_blad`, dom pomijany w kolejnych automatycznych syncach aż rodzic
  połączy się ponownie. Widoczne w „Mój dom" jako komunikat z instrukcją.
- Przycisk „Odśwież teraz" wywołuje `vulcan-sync` bezpośrednio (z body
  wskazującym konkretny dom), z pominięciem `vulcan_do_synchronizacji`.

**Uwaga implementacyjna**: `getHomework()` i `getMessages()`/`getMessageBoxes()`
w `vulcan-api-js` są typowane jako `any[]` (biblioteka nie dociąga tu pełnych
typów), a semantyka `getExams(lastSync)` (co dokładnie liczy się jako
"zmiana od `lastSync`") nie jest udokumentowana wprost — dokładny kształt
odpowiedzi i rzeczywiste zachowanie tych trzech metod trzeba zweryfikować na
żywym koncie na starcie implementacji, zanim powstanie mapowanie na nasze
tabele. Plan powinien to uwzględnić jako osobny krok odkrywczy (np. wywołanie
tych metod z prawdziwym kontem rodzica i zalogowanie surowej odpowiedzi),
zanim ktokolwiek napisze upsert.

## Ekran „Szkoła"

Nowa zakładka w głównej nawigacji (Kalendarz / Zakupy / Tablica / Terminy /
**Szkoła** / Mój dom), widoczna dla każdego domownika z kontem.

- Filtr ucznia (chipy jak przy osobach w kalendarzu) - tylko gdy więcej niż
  jedno dziecko przypisane.
- Trzy pod-zakładki (jak Miesiąc/Tydzień/Dzień w kalendarzu):
  - **Plan lekcji** - widok tygodnia dzień po dniu; zmienione/odwołane
    lekcje wyróżnione kolorem (analogicznie do statusu w „Ważne terminy").
  - **Sprawdziany i zadania domowe** - chronologiczna tabela: data, uczeń
    (gdy filtr = wszyscy), przedmiot, typ (badge), opis.
  - **Wiadomości** - lista nadawca/temat/data, treść rozwijana po kliknięciu
    (jak załączniki w „Ważne terminy" - popover albo prosty accordion).
- Stan pusty: brak połączenia (albo `status = 'wymaga_ponownej_rejestracji'`)
  → komunikat „Brak połączenia z Vulcan", z linkiem do „Mój dom" tylko dla
  rodzica.
- Wszystko tylko do odczytu - brak formularzy dodawania/edycji na tym
  ekranie.

## Decyzje (podsumowanie)

| Kwestia | Wybór |
| --- | --- |
| Zakres danych v1 | plan lekcji + zmiany, sprawdziany, zadania domowe, wiadomości |
| Poza zakresem v1 | oceny, frekwencja, odpowiadanie na wiadomości |
| Liczba kont Vulcan | jedno logowanie rodzica na cały dom, obejmuje wszystkie dzieci |
| Kto konfiguruje | tylko rodzic |
| Kto widzi dane szkolne | każdy domownik z kontem |
| Mechanizm | biblioteka `vulcan-api-js` w Supabase Edge Function, wywoływana przez `pg_cron` |
| Częstotliwość syncu | konfigurowalne godziny (do 3 dziennie), ustawiane w „Mój dom" |
| Miejsce w UI | nowa zakładka „Szkoła" z trzema pod-widokami |
| Poświadczenia Vulcan | RLS bez żadnej polityki - dostęp wyłącznie przez `service_role` |

## Otwarte ryzyka / przyszła praca

- Wersja npm biblioteki może zostać w tyle za protokołem Vulcan - opisany
  plan B (import z GitHub) w sekcji Architektura.
- Kształt odpowiedzi `getHomework`/`getMessages` nieznany do czasu testu na
  żywym koncie - do zweryfikowania na starcie implementacji.
- Oceny i frekwencja - naturalne rozszerzenie na przyszłość, świadomie poza
  tą wersją.
- Odpowiadanie na wiadomości z poziomu Kokpitu - nie planowane, integracja
  jest i ma zostać read-only.
