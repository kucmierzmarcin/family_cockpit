# Import wydarzeń z AI (prompt albo plik)

Data: 2026-09-07
Dotyczy: Kokpit Rodzinny, funkcja dodawania wydarzeń przez AI

## Po co

Ręczne wpisywanie planu lekcji dziecka albo harmonogramu odbioru śmieci do
kalendarza jest żmudne i nikt tego nie robi do końca. Import z AI ma
skrócić tę drogę: wklejasz tekst albo wgrywasz zdjęcie/PDF, AI rozpoznaje z
tego listę wydarzeń, Ty je przeglądasz i jednym kliknięciem zapisujesz do
kalendarza rodziny.

## Decyzje

| Kwestia | Wybór |
| --- | --- |
| Wejście | prompt tekstowy i/lub plik (zdjęcie albo PDF) - co najmniej jedno |
| Model danych | żadnych zmian w schemacie - jedna "pozycja" z importu = jedna seria `events` (`series_id` wspólny dla wystąpień, `null` dla jednorazowego) |
| Przypisanie osoby | AI wybiera z prawdziwej listy domowników domu (albo "Wspólne") - nie wolno mu wymyślić osoby |
| Zakres dat cyklu | AI dostaje dzisiejszą datę i samo dobiera rozsądny horyzont (dokładne daty z pliku, jeśli są podane; w innym razie rozsądny domyślny zakres) - z twardym limitem bezpieczeństwa po stronie serwera |
| Format odpowiedzi AI | structured output (tool-use) wymuszony schematem - bez parsowania wolnego tekstu |
| Zapis do bazy | dopiero po akceptacji w podglądzie, wprost z klienta (ta sama ścieżka i RLS co ręczne dodawanie wydarzenia) - Edge Function tylko rozpoznaje, nic nie zapisuje |
| Silnik AI | Gemini API (Google, darmowy limit zapytań) - natywna obsługa obrazu i PDF w jednym zapytaniu |
| Plik oryginalny | nie jest zapisywany (brak bucketu Storage) - używany tylko do rozpoznania i odrzucany |

Odrzucone: zapis od razu z Edge Function przez klucz serwisowy (omija RLS,
brak podglądu przed zapisem), osobne API do OCR (Gemini czyta obraz/PDF
bezpośrednio), pole "powtarzaj do" wpisywane ręcznie (user wybrał, żeby AI
samo zgadywało zakres - patrz limity bezpieczeństwa niżej), edycja
pojedynczych wystąpień w podglądzie (za dużo UI jak na MVP).

## Model danych

Bez zmian w `supabase/schema.sql`. Import używa istniejących tabel:

- `events` (`title`, `starts_at`, `ends_at`, `all_day`, `series_id`,
  `household_id` z domyślnego `moj_dom()`) - jak przy ręcznym dodawaniu.
- `event_members` - przypisanie wybranej osoby do wszystkich wystąpień danej
  pozycji, tą samą funkcją co ręczne przypisanie (`przypisz()` w
  `useWydarzenia.ts`).

Jedna pozycja z podglądu = jeden `series_id` (albo `null`, gdy ma dokładnie
jedno wystąpienie) - to jest ten sam mechanizm, który już obsługuje
"edytuj/usuń całą serię" w istniejącym UI, więc pomyłkę AI da się później
poprawić czy skasować bez nowego kodu.

## Kontrakt Edge Function

`supabase/functions/import-ai/index.ts` - **tylko rozpoznaje, nic nie
zapisuje do bazy.**

Wejście (`POST`, JWT zalogowanego użytkownika w `Authorization`):

```json
{ "prompt": "tekst opcjonalny", "plik": { "dane_base64": "…", "typ_mime": "image/jpeg" } }
```

Wymaga co najmniej jednego z `prompt`/`plik`. Odrzuca żądanie bez ważnego
JWT (401) i plik spoza `image/*`/`application/pdf` albo większy niż 8 MB
(400) - zanim cokolwiek trafi do Gemini.

Kroki:

1. Zweryfikuj JWT (`supabase.auth.getUser`).
2. Pobierz listę domowników wywołującego (`members` z jego `household_id` -
   działa na jego własnym JWT, te same reguły RLS co gdziekolwiek indziej).
3. `zbudujZapytanie(dzisiaj, domownicy, prompt, plik)` → treść żądania do
   Gemini wraz ze schematem narzędzia (patrz niżej) - czysta funkcja.
4. `zapytajGemini(zapytanie)` → jedyne miejsce z HTTP do Gemini API.
5. Zwaliduj limity bezpieczeństwa na wyniku (patrz niżej); po przekroczeniu
   zwróć błąd zamiast ciąć dane po cichu.
6. Zwróć klientowi surowy wynik narzędzia (pozycje) - `200`.

Wyjście (schemat narzędzia, wymuszony `tool_config.function_calling_config.mode: "ANY"`):

```json
{
  "pozycje": [
    {
      "tytul": "Matematyka",
      "czlonek": "Zuzia",
      "opis_wzorca": "poniedziałki 8:00–8:45, do 19 grudnia",
      "wystapienia": [
        { "data": "2026-09-08", "start": "08:00", "koniec": "08:45", "calodniowe": false }
      ]
    }
  ]
}
```

`czlonek` to **enum** w schemacie narzędzia zbudowany z prawdziwych imion
domowników plus `"Wspólne"` - Gemini fizycznie nie może wpisać tam nic
innego, więc "AI samo rozpoznaje osobę" nie oznacza dowolnego zgadywania
tekstu.

### Limity bezpieczeństwa (po stronie serwera, nie promptu)

Wynik od modelu to dane z granicy zaufania - walidujemy go tak samo jak
dane od użytkownika:

- łącznie maks. **150 wystąpień** we wszystkich pozycjach,
- rozpiętość dat maks. **12 miesięcy** od dzisiaj,
- każda pozycja musi mieć ≥1 wystąpienie i `czlonek` z dozwolonego zbioru.

Przekroczenie → Edge Function zwraca błąd czytelny dla użytkownika
("Rozpoznano zbyt dużo terminów - zawęź zakres albo podziel import"),
zamiast ucinać dane po cichu i pokazywać niepełny wynik jako komplet.

### Podział plików

| Plik | Rola | Zależy od |
| --- | --- | --- |
| `_wspolne/importAI.ts` | buduje zapytanie i schemat narzędzia z (dzisiaj, domownicy, prompt, plik); waliduje limity na wyniku | niczego - czyste funkcje |
| `_wspolne/gemini.ts` | jedyne miejsce z HTTP do Gemini API | klucza `GEMINI_API_KEY` |
| `import-ai/index.ts` | spina auth, pobranie domowników, oba powyższe | obu, Supabase |

`importAI.ts` testuje się zwykłym vitestem (jak `podsumowanie.ts`) - nie
importuje `Deno` ani klienta Supabase.

## Ekran (`src/ImportAI.tsx`)

Nowy przycisk „Importuj z AI" obok istniejącego „Dodaj wydarzenie".

1. **Formularz:** pole tekstowe na prompt (opcjonalne) + wybór pliku
   (opcjonalny, `image/*,application/pdf`). Przycisk „Rozpoznaj" aktywny,
   gdy wypełnione jest co najmniej jedno pole. Błąd wywołania pokazuje się
   tak samo jak w reszcie aplikacji (`className="blad"`).
2. **Podgląd:** lista pozycji zwróconych przez funkcję, każda z:
   - checkboxem włącz/wyłącz (domyślnie zaznaczony),
   - tytułem i opisem wzorca od AI (np. "poniedziałki 8:00–8:45, 12
     terminów, do 19 grudnia"),
   - rozwijaną listą do zmiany przypisanej osoby (opcje: domownicy +
     "Wspólne"), z wartością domyślną od AI.
   Edycji pojedynczych wystąpień nie ma - błędną pozycję się odznacza.
3. **Zapis:** przycisk „Zapisz zaznaczone" woła nową funkcję `dodajWiele`
   w `useWydarzenia.ts`, która dla każdej zaznaczonej pozycji: generuje
   `series_id` (pomija, gdy pozycja ma jedno wystąpienie), wstawia wiersze
   do `events` (batch insert, jak w istniejącym `dodaj()`), potem
   przypisuje wybraną osobę przez istniejące `przypisz()` (pomija przy
   "Wspólne"). Po sukcesie ekran się zamyka i kalendarz odświeża się przez
   już istniejący `useNaZywo`.

## Konfiguracja po stronie usług

Sekret Edge Function: `GEMINI_API_KEY`.

## Pliki

| Plik | Rola |
| --- | --- |
| `supabase/functions/import-ai/index.ts` | nowy - auth, domownicy, spięcie rozpoznawania |
| `supabase/functions/_wspolne/importAI.ts` | nowy - budowa zapytania, schemat narzędzia, walidacja limitów |
| `supabase/functions/_wspolne/importAI.test.ts` | nowy - testy budowy zapytania i limitów |
| `supabase/functions/_wspolne/gemini.ts` | nowy - jedyne miejsce z HTTP do Gemini API |
| `src/ImportAI.tsx` | nowy - formularz, podgląd, zapis |
| `src/useWydarzenia.ts` | nowa funkcja `dodajWiele` |
| miejsce z przyciskiem „Dodaj wydarzenie" | nowy przycisk „Importuj z AI" otwierający `ImportAI` |
| `README.md` | konfiguracja `GEMINI_API_KEY` |

## Świadomie pomijam

Zapamiętywanie wgranego pliku (Storage bucket), edycję pojedynczych
wystąpień w podglądzie, wiele plików w jednym imporcie, historię
importów, automatyczne wykrywanie duplikatów z istniejącym kalendarzem,
import z linku/adresu URL zamiast pliku.

## Weryfikacja

- Testy jednostkowe `importAI.ts`: budowa schematu z pustą/pełną listą
  domowników, wymuszenie enuma `czlonek`, walidacja limitu 150 wystąpień
  i 12 miesięcy (za i pod limitem), błąd przy braku promptu i pliku
  jednocześnie.
- Edge Function z podstawionym `zapytajGemini`: odrzuca żądanie bez JWT,
  odrzuca plik złego typu/rozmiaru, zwraca błąd czytelny dla użytkownika
  po przekroczeniu limitów zamiast ucinać dane.
- `dodajWiele` w `useWydarzenia.ts`: pozycja z jednym wystąpieniem dostaje
  `series_id = null`, pozycja z wieloma - wspólny `series_id`; "Wspólne"
  nie tworzy wiersza w `event_members`; odznaczona pozycja nie trafia do
  zapisu.
- Ręcznie: zdjęcie planu lekcji → poprawne dni/godziny/przedmioty w
  podglądzie; plik z harmonogramem śmieci z konkretnymi datami → dokładnie
  te daty, nie zgadywany cykl; import bez pliku, samym promptem.
