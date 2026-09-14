# Dashboard startowy — projekt

Data: 2026-09-14

## Cel

Nowy ekran „Dziś" w Kokpicie Rodzinnym — jeden rzut oka na to, co ważne dziś:
pogoda, data/godzina, poziomy grafik dnia całej rodziny i cztery liczniki
(pilne terminy, nowe wiadomości ze szkoły, otwarte tematy na Tablicy, rzeczy
do kupienia).

Imieniny są odłożone na później (patrz „Poza zakresem") — nie znaleziono
wiarygodnego źródła kalendarza na cały rok, a to akurat dane, gdzie błąd
byłby widoczny codziennie.

## Umiejscowienie w nawigacji

Nowa pierwsza zakładka na liście `Ekran` w `src/uklad/nawigacja.ts`:

```ts
export type Ekran = 'dashboard' | 'kalendarz' | 'zakupy' | 'tablica' | 'terminy' | 'szkola' | 'dom'
export const EKRANY: Ekran[] = ['dashboard', 'kalendarz', 'zakupy', 'tablica', 'terminy', 'szkola', 'dom']
```

- `TYTULY.dashboard = 'Dziś'`.
- `etykietaDodania('dashboard', …)` zwraca `null` — brak przycisku „+" na tym
  ekranie, to widok tylko do odczytu (poza klikalnymi licznikami, patrz niżej).
- `App.tsx`: nowa gałąź `ekran === 'dashboard'` w `tresc`, analogicznie do
  istniejących gałęzi dla `zakupy`/`tablica`/`terminy`/`szkola`/`dom`.

## Struktura plików

Zgodnie z konwencją repo — każdy ekran sam ładuje swoje dane przez własny
hook (`Zakupy` → `useZakupy`, `Tablica` → `useTablica`, `Terminy` →
`useTerminy`). `Dashboard.tsx` dostaje z `App.tsx` tylko to, co już jest tam
scentralizowane (`osoby.domownicy`, `vulcan.wiadomosci`, `profil.household_id`,
funkcję `przelaczEkran`), a resztę ładuje sam:

| Plik | Rola |
| --- | --- |
| `src/Dashboard.tsx` | Spina ekran: karty pogody/zegara, grafik dnia, liczniki |
| `src/usePogoda.ts` | Fetch do Open-Meteo, bez klucza API |
| `src/widoki/GrafikDnia.tsx` | Poziomy „schedule view" — wiersz na domownika |
| `src/dashboardLiczniki.ts` | Czyste funkcje liczące 4 liczniki (bez Reacta, testowalne) |

`Dashboard.tsx` woła dodatkowo:
- `useTerminy(householdId, onBlad)` (już istnieje)
- `useTablica(onBlad)` (już istnieje)
- `useZakupy(onBlad)` (już istnieje)
- osobne `useWydarzenia(poczatekDzis, koniecDzis, onBlad)` — niezależne od
  zakresu, po którym nawiguje zakładka „kalendarz" (tamten `dane` w `App.tsx`
  pokazuje miesiąc/tydzień/dzień zależnie od stanu `widok`, dashboard zawsze
  chce dokładnie dzisiaj).

To są trzy nowe zapytania do bazy przy wejściu na tę zakładkę (terminy,
tablica, zakupy) — dziś nic ich nie ładuje na starcie aplikacji, tylko po
wejściu na odpowiedni ekran.

## Widżety — logika danych

**Data i godzina** — żywy zegar, `setInterval` co minutę, formatowanie przez
istniejące helpery z `dates.ts`.

**Pogoda (Milanówek)** — `usePogoda`: jedno zapytanie do Open-Meteo
(`current` + `hourly` na dziś) dla stałych współrzędnych Milanówka
(52.1325°N, 20.6539°E), odświeżane co ok. 30 minut. Open-Meteo nie wymaga
klucza API, więc wywołanie idzie wprost z przeglądarki — bez nowej Edge
Function i bez sekretów do trzymania.

**Poziomy grafik dnia (`GrafikDnia.tsx`)**:
- Jeden wiersz na każdego domownika z `osoby.domownicy` — zawsze wszyscy,
  nawet bez wydarzeń dziś (pusty wiersz = „nic dziś zaplanowane").
- Oś pozioma = godziny, okno domyślnie 6–23, rozszerzane (jak w
  `SiatkaGodzin.tsx`, `wypelnijOkno`) gdy któreś wydarzenie wykracza poza ten
  zakres.
- Nakładające się wydarzenia tej samej osoby układane tym samym
  `ukladajKolumny` z `czas.ts`, tylko obrócone o 90° — kolumny z oryginalnego
  algorytmu stają się poziomymi „torami" w obrębie wiersza tej osoby zamiast
  pionowymi kolumnami obok siebie. Logika nakładania się nie zmienia, zmienia
  się tylko oś rysowania.
- Dane: wydarzenia z nowego `useWydarzenia(poczatekDzis, koniecDzis)`,
  filtrowane po widoczności tak jak dziś (`widocznePrzyFiltrze`) — na
  dashboardzie nie ma jednak przełączników osób, więc filtr `ukryci` tu nie
  wchodzi w grę, pokazujemy wszystko.

**Cztery liczniki (`dashboardLiczniki.ts`)**:

| Licznik | Źródło | Warunek |
| --- | --- | --- |
| Pilne terminy | `terminy` z `useTerminy` | `!zalatwiony && powiadom !== null && czyPrzeterminowany(powiadom, dzisiaj)` — ta sama funkcja z `terminy.ts`, która już dziś liczy `powiadomienieMinelo` na ekranie „Terminy" (`WazneTerminy.tsx:171`), więc dashboard pokazuje dokładnie te same terminy, które tam świecą się jako spóźnione z powiadomieniem — czerwony, gdy >0 |
| Nowe wiadomości dziś | `vulcan.wiadomosci` (już ładowane centralnie w `App.tsx`) | `klucz(new Date(data)) === klucz(dzisiaj)`, liczone przez **wszystkich** uczniów łącznie (dashboard jest widokiem całego domu, nie jednego dziecka jak ekran „Szkoła") |
| Otwarte tematy | `tablica.notatki` z `useTablica` | wszystkie notatki, bez rozróżnienia zrobione/niezrobione (Tablica dziś takiego pola nie ma) |
| Do kupienia | `zakupy.pozycje` z `useZakupy` | gotowa funkcja `policzPozostale(pozycje)` z `pozycje.ts` — już liczy po całym domu, nie po jednej liście |

Każdy licznik to klikalny przycisk, który woła `przelaczEkran(...)` do
odpowiedniej zakładki (`terminy`, `szkola`, `tablica`, `zakupy`) — ten sam
wzorzec co dziś kliknięcie bloku „Szkoła" w widoku kalendarza.

## Layout i responsywność

- **Biurko**: rząd kart u góry (zegar/data, pogoda), pod spodem
  `GrafikDnia` na pełną szerokość, na dole rząd 4 liczników.
- **Telefon**: te same karty jedna pod drugą, liczniki w siatce 2×2,
  `GrafikDnia` przewijany poziomo (te same style przewijania co dziś w
  `SiatkaGodzin.tsx`).

## Obsługa błędów

- `terminy`/`tablica`/`zakupy` używają istniejącego `onBlad` → ten sam
  czerwony komunikat co dziś na innych ekranach.
- Pogoda ma własny, cichy fallback (krótki komunikat w karcie, np. „Pogoda
  niedostępna") i **nie** woła `onBlad` — brak internetu do Open-Meteo nie
  powinien blokować reszty dashboardu, tak jak dziś opcjonalne integracje
  (Telegram, Vulcan) nie blokują reszty aplikacji.

## Testy

Logika bez Reacta trafia do plików `.ts` z testami obok, wzorem
`czas.test.ts` i `nawigacja.test.ts`:

- `dashboardLiczniki.test.ts` — każdy z 4 liczników osobno, w tym przypadki
  brzegowe (`powiadom === null`, wiadomości z wczoraj, pusta lista zakupów).

Sam layout (JSX) zostaje bez testów, zgodnie z konwencją reszty repo.

## Poza zakresem

- **Imieniny** — brak wiarygodnego źródła kalendarza na cały rok znalezionego
  podczas researchu (próby przez wyszukiwarkę i publiczne API dawały
  niespójne albo niedziałające wyniki). Do dodania później, gdy pojawi się
  zaufane źródło danych (własna lista użytkownika, zweryfikowana ręcznie
  lista z Wikipedii, albo działające API) — osobny, mały dodatek do
  `Dashboard.tsx`, nie zmienia reszty projektu.
- Podgląd kamer Hikvision (osobny temat, odłożony wcześniej).
- Edycja/dodawanie czegokolwiek z poziomu dashboardu — to widok tylko do
  odczytu poza nawigacją przez kliknięcie licznika.
- Status „zrobione" dla notatek na Tablicy — dziś liczymy wszystkie karteczki.
