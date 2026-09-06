# Logowanie, gospodarstwa domowe i role

Data: 2026-09-06
Dotyczy: Kokpit Rodzinny, funkcja #0 z planu budowy (Faza 1 — fundament bezpieczeństwa)

## Po co

Dziś reguły RLS pozwalają czytać, dodawać i usuwać dane każdemu, kto zna adres
aplikacji. To był świadomy kompromis na czas budowy kalendarza. Ta zmiana go
zamyka: dane widzi wyłącznie zalogowany domownik, i tylko te ze swojego domu.

## Decyzje

Ustalone przed napisaniem tego dokumentu:

| Kwestia | Wybór |
| --- | --- |
| Logowanie | e-mail + hasło (nie magic link — brak SMTP) |
| Model | gospodarstwa domowe (`households`) z rolami |
| Rejestracja | zamknięta; konta zakłada rodzic w panelu Supabase |
| Osoba bez konta | dozwolona — dziecko ma imię, kolor i wydarzenia, ale się nie loguje |
| Zapraszanie | ręczne: konto w panelu + adres wpisany przy osobie w aplikacji |

Odrzucone: magic link (limit poczty Supabase, wpada w spam), kod zaproszenia
(niepotrzebny przy zamkniętej rejestracji), Resend teraz (to funkcja #8).

## Model danych

```
households   id, name, created_at
members      id, household_id, name, color, role, user_id?, email?, created_at
events       id, title, event_date, event_time, member_id?, household_id,
             created_by?, created_at
```

`members` powstaje ze zmiany nazwy istniejącej `family_members` — dane w niej
zostają. Łączy dwie rzeczy w jednym bycie:

- profil w kalendarzu: `name`, `color` (już istnieją),
- przynależność do domu: `household_id`, `role`, `user_id`, `email`.

`user_id` i `email` puste oznaczają osobę bez konta. `role` przyjmuje wartości
`rodzic`, `domownik`, `dziecko`.

`events.created_by` wskazuje na `members.id` autora wpisu — potrzebne, by
odróżnić „moje wydarzenie" od cudzego przy usuwaniu.

## Łączenie konta z osobą

Aplikacja używa klucza publishable, więc nie ma prawa czytać `auth.users` i nie
może sama znaleźć konta po adresie. Robi to funkcja w bazie:

```sql
polacz_moje_konto()  -- SECURITY DEFINER
```

Wołana raz po każdym zalogowaniu. Ustawia `user_id` w tym wierszu `members`,
którego `email` zgadza się z adresem zalogowanego użytkownika i który nie ma
jeszcze przypisanego konta.

Dzięki temu kolejność czynności nie ma znaczenia: konto może powstać przed
wpisaniem adresu przy osobie albo po.

Odrzucono trigger na `auth.users` — działa, ale modyfikuje schemat `auth` i nie
daje tu nic ponad powyższe.

## Reguły dostępu

Trzy funkcje pomocnicze, wszystkie `SECURITY DEFINER` i `stable`:

- `moj_dom()` — `household_id` zalogowanego,
- `ja_jako_member()` — `members.id` zalogowanego,
- `jestem_rodzicem()` — czy zalogowany ma rolę `rodzic`.

Są konieczne, bo polityka na `members`, która sama odpytuje `members`, wpada w
rekurencję. `SECURITY DEFINER` omija RLS wewnątrz funkcji i przerywa pętlę.

| Tabela | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| `households` | mój dom | — | rodzic | — |
| `members` | mój dom | rodzic | rodzic | rodzic |
| `events` | mój dom | mój dom | autor, przypisany lub rodzic | autor, przypisany lub rodzic |

„Moje wydarzenie" = `created_by` wskazuje na mnie **lub** `member_id` wskazuje na
mnie. Rodzic dodający wpis dziecku zachowuje więc do niego dostęp, a dziecko
może usunąć to, co dostało przypisane.

Wszystkie dotychczasowe polityki dla roli `anon` zostają usunięte.

## Ekrany

```
Logowanie  ──>  Bramka  ──>  Kalendarz  <──>  Mój dom
                   │
                   └──> "Konto nie należy do żadnego domu"
```

- **Logowanie** — e-mail i hasło. Bez rejestracji, bez odzyskiwania hasła
  (hasło resetuje rodzic w panelu).
- **Bramka** — trzyma sesję, woła `polacz_moje_konto()`, wpuszcza dalej. Konto
  bez domu dostaje komunikat wyjaśniający zamiast pustego kalendarza.
- **Mój dom** — lista domowników z rolą i statusem konta (*połączone*, *czeka na
  pierwsze logowanie*, *bez konta*). Rodzic edytuje imię, kolor, rolę i adres;
  pozostali widzą listę bez możliwości zmian.
- **Kalendarz** — jak dziś, plus nagłówek z zalogowanym użytkownikiem,
  przełącznikiem widoku i wylogowaniem.

Przełączanie widoków zwykłym stanem, bez react-routera — dwa ekrany go nie
uzasadniają.

## Pliki

| Plik | Rola |
| --- | --- |
| `src/auth/useSesja.ts` | nowy — sesja Supabase Auth, logowanie, wylogowanie |
| `src/auth/Logowanie.tsx` | nowy — formularz e-mail + hasło |
| `src/auth/Bramka.tsx` | nowy — sesja → `polacz_moje_konto()` → aplikacja |
| `src/MojDom.tsx` | nowy — ekran zarządzania domownikami |
| `src/useDomownicy.ts` | rozszerzony o rolę, adres konta i edycję |
| `src/App.tsx` | nagłówek z użytkownikiem, przełącznik widoku |
| `src/main.tsx` | renderuje `Bramka` zamiast `App` |
| `src/lib/supabase.ts` | typy `Dom`, `Rola`; `DomownikDb` o nowe pola |
| `supabase/schema.sql` | pełny schemat po zmianie |
| `supabase/start.sql` | nowy — skrypt startowy pierwszego domu |

Panel „Domownicy" z prawej kolumny kalendarza znika — jego rolę przejmuje ekran
„Mój dom", gdzie jest miejsce na rolę i adres konta.

## Migracja

Istniejące dane przetrwają. Kolejność:

1. `family_members` → `members`, dochodzą nowe kolumny (nullowalne).
2. `events` dostaje `household_id` i `created_by`.
3. Funkcje pomocnicze i nowe polityki; stare polityki `anon` usunięte.
4. `supabase/start.sql` — uruchamiany ręcznie raz: zakłada dom, wciąga do niego
   istniejące osoby i wydarzenia, ustawia adres pierwszego rodzica.

Do czasu wykonania kroku 4 aplikacja nie pokaże danych — `household_id` jest
puste, więc nic nie pasuje do `moj_dom()`.

## Czynności po stronie użytkownika

1. **Authentication → Sign In/Providers → Email**: wyłączyć *Allow new users to
   sign up* oraz *Confirm email* (nie ma poczty, która by potwierdziła).
2. **Authentication → Users → Add user**: konto dla siebie, potem dla
   domowników.
3. **SQL Editor**: wkleić `supabase/start.sql` z własnym adresem.

## Weryfikacja

- `npm run lint`, `npm run build`.
- Reguły RLS sprawdzone zapytaniami SQL z perspektywy różnych ról — klikanie w
  interfejsie nie dowodzi, że baza broni danych.
- W przeglądarce: ekran logowania, komunikat dla konta bez domu, odrzucenie
  błędnych danych.
- Poza zakresem asystenta: zakładanie kont i logowanie hasłem. Pierwsze
  zalogowanie wykonuje użytkownik.

## Świadomie pominięte

Zapraszanie mailem, odzyskiwanie hasła, wiele gospodarstw na jedno konto,
przenoszenie osoby między domami, historia zmian. Żadne z nich nie jest
potrzebne, by zamknąć otwarte reguły dostępu — a to jest celem tego kroku.
