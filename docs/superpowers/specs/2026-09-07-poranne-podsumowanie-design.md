# Poranne podsumowanie dnia mailem

Data: 2026-09-07
Dotyczy: Kokpit Rodzinny, funkcja #8 z planu budowy (powiadomienia)

## Po co

Kokpit działa, dopóki ktoś do niego zajrzy. Poranny mail odwraca ten kierunek:
raz dziennie dom sam mówi, co go dziś czeka — wydarzenia, świeże ogłoszenia
z tablicy i to, czego brakuje na listach zakupów.

To pierwszy kanał wychodzący w aplikacji. Drugim ma być bot na komunikatorze,
który nie tylko powiadamia, ale też rozmawia i zapisuje zmiany. Dlatego
odpowiedź na pytanie „co dziś w tym domu" powstaje **osobno od wysyłki maila**
i jest gotowa do ponownego użycia — bot ma po nią sięgnąć, nie napisać jej
drugi raz.

## Decyzje

| Kwestia | Wybór |
| --- | --- |
| Zakres na start | tylko poranne podsumowanie; przypomnienia i zaproszenia później |
| Treść | kalendarz na dziś + tablica + liczniki zakupów |
| Włącznik | per osoba, domyślnie **wyłączony** |
| Godzina | per osoba, co 30 minut w zakresie 5:00–10:00 |
| Strefa | `Europe/Warsaw`, liczona w bazie |
| Pusty dzień | mail i tak idzie, jednozdaniowy |
| Harmonogram | `pg_cron` co 15 minut → `pg_net` → Edge Function |
| Wysyłka | Resend, schowany za jednym modułem |
| Odbiorca | wyłącznie domownik z kontem i adresem |

Odrzucone: wysyłka prosto z SQL przez `pg_net` (składanie HTML-a w PL/pgSQL,
brak testów, logika nie do odzyskania dla bota), cron w GitHub Actions (drugi
system i spóźnienia rzędu kilkunastu minut przy mailu „na 6:30"), jedna
wspólna godzina dla całego domu.

Domyślnie wyłączone, bo mail, którego nikt nie zamawiał, jest spamem — nawet
od własnej rodziny.

## Model danych

```sql
alter table members
  add column digest_enabled boolean not null default false,
  add column digest_at      time    not null default '07:00';

create table digest_log (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members(id) on delete cascade,
  sent_for   date not null,
  status     text not null default 'w_toku',
  attempts   int  not null default 1,
  error      text,
  claimed_at timestamptz not null default now(),
  sent_at    timestamptz,
  constraint digest_log_status_check check (status in ('w_toku', 'wyslane', 'blad')),
  unique (member_id, sent_for)
);
```

`unique (member_id, sent_for)` jest sednem tej tabeli, nie ozdobą. Cron chodzi
co 15 minut; dwa przebiegi, które się na siebie nałożą, nie wyślą maila dwa
razy, bo drugi odbije się od bazy. Przy okazji dziennik odpowiada na pytanie
„czy dziś poszło i dlaczego nie".

Usunięcie domownika kasuje jego wpisy w dzienniku — inaczej niż przy
wydarzeniach, bo zapis „wysłano mail nieistniejącej osobie" nikomu nie służy.

## Wybór odbiorców

Jedna funkcja `SECURITY DEFINER` **wybiera i zajmuje w jednym zapytaniu**:

```sql
do_wyslania(p_teraz timestamptz default now())
  returns table (log_id uuid, member_id uuid, household_id uuid, email text, name text)
```

Kto wstawił wiersz do `digest_log`, ten wysyła. Rozbicie tego na „najpierw
wybierz, potem oznacz" otwiera okno, w którym dwa przebiegi wezmą tę samą
osobę.

Kwalifikuje się domownik, który ma `digest_enabled`, konto (`user_id`) i adres,
a lokalny czas mieści się w oknie `digest_at … digest_at + 2h`. Okno zamiast
punktu, żeby zatkany cron albo chwilowa awaria nadrobiły zaległość zamiast
gubić dzień. Skutek uboczny: kto włączy powiadomienie o 7:30, mając ustawione
7:00, dostanie maila od razu. To akceptowalne — sygnał, że działa.

Ponowienie dostaje wiersz ze statusem `blad` przy mniej niż trzech próbach oraz
wiersz `w_toku` starszy niż 15 minut, bo taki znaczy, że funkcja padła
w połowie.

Parametr `p_teraz` istnieje po to, żeby dało się to sprawdzić testem
i wymusić wysyłkę bez czekania do rana — ten sam chwyt co `teraz` w
`src/notatki.ts`.

## Dane do podsumowania

```sql
podsumowanie_domu(p_dom uuid, p_dzien date) returns jsonb
```

Zwraca komplet dla jednego domu:

```json
{
  "dzien": "2026-09-09",
  "wydarzenia": [{ "id": "…", "title": "…", "starts_at": "…", "ends_at": "…",
                   "all_day": false, "osoby": [{ "id": "…", "name": "Ola" }] }],
  "notatki":    [{ "id": "…", "content": "…", "pinned": true, "autor": "Ola" }],
  "listy":      [{ "id": "…", "name": "Spożywcze", "pozostalo": 4 }]
}
```

Wydarzenia dnia to te, których przedział przecina dobę — więc wyjazd 9–11
września wchodzi także 10 września. Koniec jest wyłączny, tak jak wszędzie
indziej w tej aplikacji (`src/czas.ts`).

Notatki: wszystkie przypięte plus dodane w ciągu ostatniej doby.

Zakupy: nazwa listy i liczba nieodhaczonych pozycji, bez wyliczania czego.
Pełna lista mleka i chleba o 7 rano to szum; liczba wystarczy, żeby wiedzieć,
czy zaglądać.

Funkcja liczy się **raz na dom**, nie raz na osobę. Trzech domowników pod
jednym adresem to jedno zapytanie, nie trzy.

To jest punkt, w który wepnie się przyszły bot: `podsumowanie_domu()` nie wie,
że istnieje poczta.

## Harmonogram

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

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

Klucz serwisowy i URL leżą w Vault, nie w treści zadania — `cron.job` czyta
każdy, kto ma dostęp do bazy.

Krok 15 minut przy godzinach wybieranych co 30 daje zapas na spóźniony
przebieg. Dziennie to 96 wywołań funkcji, w większości kończących się na
pustym wyniku `do_wyslania()` — mieści się w darmowym limicie z ogromnym
marginesem.

## Edge Function

`supabase/functions/poranne-podsumowanie/index.ts` jest cienka i tylko spina:

1. `do_wyslania()` → lista zajętych odbiorców,
2. dla każdego **domu** raz `podsumowanie_domu(dom, dzień)`,
3. `zbudujPodsumowanie(dane, odbiorca)` → temat, HTML, tekst,
4. `wyslij()` → Resend,
5. `zamknij_wysylke(log_id, blad)` — jedna funkcja na oba wyjścia, bo
   sukces i porażka różnią się tu wyłącznie tym, czy jest treść błędu.

Podział na pliki bierze się z tego, co się zmienia niezależnie:

| Plik | Rola | Zależy od |
| --- | --- | --- |
| `_wspolne/podsumowanie.ts` | układa temat i treść z danych | niczego — czyste funkcje |
| `_wspolne/resend.ts` | jedyne miejsce z HTTP do dostawcy poczty | klucza API |
| `poranne-podsumowanie/index.ts` | spina powyższe z bazą | obu |

`podsumowanie.ts` nie importuje niczego z Deno ani z Supabase, więc testuje się
zwykłym vitestem — tak jak `czas.ts` i `notatki.ts`, bez zmian w konfiguracji.
Odwrotnie z `index.ts` i `resend.ts`: sięgają po `Deno`, więc katalog
`supabase/` zostaje **poza** `tsconfig.app.json` i `npm run build` ich nie
tyka. Zmiana dostawcy poczty dotyka wyłącznie `resend.ts`.

## Treść maila

Temat mówi wszystko przed otwarciem:

- `Środa, 9 września — 3 wydarzenia`
- `Środa, 9 września — spokojny dzień`

Sekcje w kolejności: **Dziś w kalendarzu**, **Tablica**, **Zakupy**.

W kalendarzu najpierw całodniowe i trwające wielodniowe, potem godzinowe
rosnąco. Każde: godzina, tytuł, osoby. Wydarzenia, do których adresat jest
przypisany, wyróżnione — mail idzie do konkretnej osoby, więc niech od razu
widzi swoje.

Pusta sekcja nie pojawia się wcale. Gdy puste są wszystkie trzy — jedno zdanie
i koniec.

HTML ze stylami inline, bo klienci pocztowi nie czytają `<style>`; do tego
wersja tekstowa. Stopka: „Wyłączysz to w Kokpicie → Mój dom". Link do
aplikacji ze zmiennej `APP_URL`; przy pustej zmiennej znika, zamiast prowadzić
w nicość.

## Ekran ustawień

W „Mój dom", **tylko przy własnym wierszu**: przełącznik „Poranne
podsumowanie" i wybór godziny. Cudzych powiadomień nie ustawia nikt, rodzic
też nie — to skrzynka tej osoby.

Zapis idzie przez funkcję, nie przez zwykły `update`:

```sql
ustaw_powiadomienia(p_wlaczone boolean, p_godzina time) returns void
```

Powód jest konkretny. Polityka „Domownicy - zmiana" pozwala dziś zmieniać
wiersze tylko rodzicowi. Dopisanie „każdy może zmienić swój wiersz" dałoby
dziecku prawo przestawić sobie `role` na `rodzic`, bo RLS filtruje wiersze,
a nie kolumny. Kolumny ogranicza więc funkcja `SECURITY DEFINER`, która rusza
wyłącznie `digest_enabled` i `digest_at` we własnym wierszu wywołującego.

## Konfiguracja po stronie usług

Sekrety Edge Function: `RESEND_API_KEY`, `RESEND_FROM`, `APP_URL`.
Sekrety Vault: `kokpit_url_funkcji`, `kokpit_klucz_serwisowy`.

Resend bez zweryfikowanej domeny wysyła **tylko na adres właściciela konta**.
Na start wystarcza to do sprawdzenia całości; po dodaniu rekordów DNS maile
zaczynają docierać do reszty domowników i kod się przez to nie zmienia.

## Pliki

| Plik | Rola |
| --- | --- |
| `supabase/functions/poranne-podsumowanie/index.ts` | nowy — spięcie bazy, treści i wysyłki |
| `supabase/functions/_wspolne/podsumowanie.ts` | nowy — temat i treść z danych |
| `supabase/functions/_wspolne/podsumowanie.test.ts` | nowy — testy tej logiki |
| `supabase/functions/_wspolne/resend.ts` | nowy — wysyłka, jedyne miejsce z dostawcą |
| `supabase/schema.sql` | kolumny, `digest_log`, funkcje, cron |
| `src/MojDom.tsx` | sekcja „Powiadomienia" przy własnym wierszu |
| `src/useDomownicy.ts` | wywołanie `ustaw_powiadomienia` |
| `src/lib/supabase.ts` | pola `digest_enabled`, `digest_at` w typie domownika |
| `src/App.css` | style przełącznika i wyboru godziny |
| `README.md` | konfiguracja Resend, cron, opis funkcji |

## Świadomie pomijam

Przypomnienia przed pojedynczym wydarzeniem, podsumowanie tygodnia,
zaproszenia mailem, wypisanie się linkiem w stopce (ustawienie jest
w aplikacji, a każdy odbiorca ma tam konto), powiadomienia push, wybór sekcji
w mailu, historię wysłanych treści, maile do osób bez konta.

Bot na komunikatorze jest osobną funkcją i osobnym specem. Ten dokument tylko
zostawia mu wejście: `podsumowanie_domu()` i `zbudujPodsumowanie()`.

## Weryfikacja

- Testy jednostkowe `podsumowanie.ts`: pusty dzień, wydarzenie całodniowe,
  wielodniowe trwające dziś, kolejność, wyróżnienie własnych, liczniki zakupów,
  granica „notatki od wczoraj", temat w liczbie mnogiej i pojedynczej.
- `do_wyslania` wywołane dwa razy pod rząd zwraca odbiorcę tylko za pierwszym
  razem; wiersz `blad` wraca do puli, wiersz `wyslane` nie.
- `ustaw_powiadomienia` zapytaniami z perspektywy ról: czy dziecko przestawi
  sobie godzinę (powinno), czy zmieni ustawienie rodzica (nie powinno), czy
  przy okazji zmieni sobie rolę (nie powinno).
- Wysyłka na żywo: `do_wyslania` z podstawionym `p_teraz`, mail dochodzi na
  adres właściciela konta Resend.
- Osoba bez konta z wpisanym adresem nie trafia do wyniku `do_wyslania`.
