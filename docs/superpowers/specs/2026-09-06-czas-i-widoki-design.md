# Model czasu, widoki tygodnia i dnia, wydarzenia cykliczne

Data: 2026-09-06
Dotyczy: Kokpit Rodzinny, funkcja #1 z planu budowy (Faza 2 — rdzeń)

## Po co

Dziś wydarzenie to jedna data i opcjonalna godzina. Nie da się zapisać, że coś
trwa od 18:00 do 20:00 ani że wyjazd ciągnie się przez tydzień. Kalendarz ma też
tylko widok miesiąca, w którym godziny są nieczytelne.

## Decyzje

| Kwestia | Wybór |
| --- | --- |
| Czas | `timestamp` bez strefy, `starts_at` + `ends_at` |
| Całodniowe | flaga `all_day`, zakres od północy do północy |
| Wielodniowe | jeden wiersz, nie kopia na każdy dzień |
| Cykliczność | osobne wystąpienia ze wspólnym `series_id` |
| Koniec serii | pole „powtarzaj do", domyślnie rok |
| Widoki | miesiąc, tydzień, dzień — siatka godzin dla dwóch ostatnich |
| Testy | vitest, pokrywa `czas.ts` |

## Model czasu

```sql
starts_at timestamp not null
ends_at   timestamp not null   -- check (ends_at > starts_at)
all_day   boolean not null default false
series_id uuid                 -- wspólne dla wystąpień jednej serii
```

Kolumny `event_date` i `event_time` znikają. Baza jest pusta, więc nie ma
migracji danych.

**Dlaczego `timestamp` bez strefy.** Aplikacja działa w jednej strefie, więc
strefy są tu wyłącznie kosztem. `timestamptz` przy wydarzeniach całodniowych
prowadzi do przesunięć w rodzaju „wakacje zaczynają się 9 lipca o 23:00".
Rozbicie na `date` + `time` (osobno początek i koniec) unika stref, ale zamienia
test nakładania przedziałów w porównywanie par kolumn.

Wybrana reprezentacja daje jednolinijkowy test, identyczny dla wydarzeń
godzinnych, całodniowych i wielodniowych:

```sql
where starts_at < :koniec_zakresu and ends_at > :poczatek_zakresu
```

Wydarzenie całodniowe: `all_day = true`, `starts_at` o północy pierwszego dnia,
`ends_at` o północy dnia następującego po ostatnim. „Wakacje 10–20 lipca" to
`2026-07-10 00:00` → `2026-07-21 00:00`.

Indeks: `(household_id, starts_at, ends_at)`.

## Cykliczność

Zapis serii tworzy konkretne wystąpienia ze wspólnym `series_id`. Formularz ma
pole „powtarzaj" (nie powtarzaj / co tydzień / co dwa tygodnie / co miesiąc)
oraz „powtarzaj do" — domyślnie rok od początku.

Edycja i usunięcie wystąpienia należącego do serii pyta o zakres:

- **tylko to** — zmiana dotyczy jednego wiersza,
- **to i wszystkie kolejne** — `where series_id = :seria and starts_at >= :od`.

Wystąpienia wcześniejsze zostają nietknięte, więc historia się nie zmienia.

**Świadomie pominięte:** tabela z regułą powtarzania i dogenerowywanie w tle.
Konsekwencja: seria kończy się na wybranej dacie i po jej upływie trzeba założyć
ją na nowo. Reguła w bazie plus zadanie cykliczne to wyraźnie większy kawałek
pracy, który w kalendarzu rodzinnym rzadko się zwraca.

Przy powtarzaniu miesięcznym dzień 29–31 nie istnieje w każdym miesiącu.
Zasada: wystąpienie wypada w miesiącach, które takiego dnia nie mają (nie jest
przesuwane na ostatni dzień miesiąca) — przesuwanie daje niespodzianki w rodzaju
spotkania 28 lutego zamiast 31 stycznia.

## Widoki

Trzy zakładki — **Miesiąc / Tydzień / Dzień**. Strzałki i „Dziś" działają
w kontekście bieżącego widoku (miesiąc → miesiąc, tydzień → tydzień, dzień →
dzień).

Tydzień i dzień dzielą jeden komponent siatki godzin:

- pełna doba, otwarta przewinięta na 7:00,
- wydarzenie to blok, którego wysokość odpowiada czasowi trwania,
- nad siatką pasek na wydarzenia całodniowe i wielodniowe; wychodzące poza
  widoczny zakres dostają strzałkę,
- wydarzenia nakładające się w czasie dzielą szerokość kolumny po równo.

Widok miesiąca zostaje bez zmian poza tym, że pigułki pokazują godzinę
rozpoczęcia, a wielodniowe rysują się jako ciągły pasek.

## Pliki

`App.tsx` ma ~450 linii i trzyma stan kalendarza, formularz, filtry i przełącznik
ekranów. Dołożenie dwóch widoków bez rozbicia dałoby plik nie do ogarnięcia.

| Plik | Rola |
| --- | --- |
| `src/czas.ts` | nowy — przedziały, formatowanie, rozwijanie serii, układanie nakładek |
| `src/czas.test.ts` | nowy — testy logiki czasu |
| `src/useWydarzenia.ts` | nowy — pobieranie i zapis, wyjęte z `App.tsx` |
| `src/widoki/Miesiac.tsx` | siatka miesiąca, przeniesiona z `App.tsx` |
| `src/widoki/Tydzien.tsx` | nowy |
| `src/widoki/Dzien.tsx` | nowy |
| `src/widoki/SiatkaGodzin.tsx` | nowy — wspólny silnik tygodnia i dnia |
| `src/FormularzWydarzenia.tsx` | nowy |
| `src/App.tsx` | spinacz: stan widoku, filtry, nagłówek |

## Testy

Repo nie ma dziś infrastruktury testowej. Wchodzi **vitest** (bez jsdom —
testujemy czyste funkcje, nie komponenty) i skrypt `npm test`.

`czas.ts` to czysta logika i tam mieszkają błędy, więc pokrycie obejmuje:

- nakładanie przedziałów na zakres widoku,
- wydarzenie przez północ i dłuższe niż widoczny zakres,
- wydarzenie kończące się dokładnie o północy (nie powinno zajmować dnia
  następnego),
- generowanie serii tygodniowej, dwutygodniowej i miesięcznej,
- pominięcie 31. dnia w miesiącach, które go nie mają,
- układanie nakładających się wydarzeń w kolumny.

## Weryfikacja

`npm test`, `npm run lint`, `npm run build` oraz przejście w przeglądarce przez
wszystkie trzy widoki: wydarzenie godzinne, całodniowe, wielodniowe i seria.
