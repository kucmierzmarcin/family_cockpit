# Kokpit Rodzinny

Wspólny kalendarz rodzinny w trzech widokach — miesiąc, tydzień i dzień.
Wydarzenie ma początek i koniec, może trwać cały dzień albo ciągnąć się przez
kilka dni, i może się powtarzać. Wszystko zapisuje się w bazie Supabase, więc
widzi to każdy zalogowany domownik.

Dostęp wymaga logowania. Dane należą do gospodarstwa domowego — zalogowany widzi
wyłącznie kalendarz swojego domu.

Do tego lista domowników: każdą osobę dodajesz z imieniem i kolorem, przypisujesz
do niej wydarzenia, a kalendarz koloruje je po osobie. Przełączniki nad siatką
pozwalają ukryć wybrane osoby. Wydarzenie nie musi mieć przypisanej osoby —
takie zostaje „bez osoby" i ma neutralną szarość.

Zbudowane na React + TypeScript + Vite.

## Uruchomienie

```bash
npm install
npm run dev
```

Aplikacja wystartuje pod adresem, który wypisze się w terminalu (zwykle
http://localhost:5173).

## Konfiguracja bazy

1. Skopiuj `.env.example` do `.env` i wpisz dane swojego projektu Supabase
   (panel Supabase → **Project Settings** → **API**):

   ```
   VITE_SUPABASE_URL=https://twoj-projekt.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
   ```

   Plik `.env` jest w `.gitignore` — nie trafia na GitHub.

2. W panelu Supabase otwórz **SQL Editor**, wklej całą zawartość
   [`supabase/schema.sql`](supabase/schema.sql) i kliknij **Run**.

3. **Authentication → Sign In / Providers → Email**: zostaw *Allow new users to
   sign up* **włączone** (konta zakłada się w aplikacji), a *Confirm email*
   **wyłącz** — potwierdzenie przychodzi mailem, a poczty nie mamy podpiętej.

4. Otwórz aplikację, wybierz **Załóż konto**, a po zalogowaniu **Załóż własny
   dom**. Zostaniesz w nim rodzicem. To wszystko — nie trzeba nic klikać w panelu.

Skrypt [`supabase/start.sql`](supabase/start.sql) jest już opcjonalny. Przydaje
się tylko wtedy, gdy w bazie leżą dane sprzed wprowadzenia logowania i trzeba je
wciągnąć do nowo założonego domu.

## Struktura

| Plik | Do czego służy |
| --- | --- |
| `src/auth/Bramka.tsx` | Wpuszcza do aplikacji: sesja, powiązanie konta, profil |
| `src/auth/Logowanie.tsx` | Formularz e-mail + hasło |
| `src/auth/useSesja.ts` | Sesja Supabase Auth, logowanie, wylogowanie |
| `src/App.tsx` | Spina kalendarz: wybór widoku, filtry osób, nagłówek |
| `src/widoki/Miesiac.tsx` | Siatka miesiąca |
| `src/widoki/Tydzien.tsx` | Tydzień — siedem kolumn siatki godzin |
| `src/widoki/Dzien.tsx` | Dzień — jedna kolumna siatki godzin |
| `src/widoki/SiatkaGodzin.tsx` | Wspólny silnik tygodnia i dnia |
| `src/FormularzWydarzenia.tsx` | Dodawanie i edycja wydarzeń |
| `src/czas.ts` | Przedziały czasu, serie, układanie nakładek |
| `src/osoby.ts` | Uczestnicy wydarzenia: kolejność, barwy, filtr |
| `src/Zakupy.tsx` | Ekran „Zakupy": listy i pozycje |
| `src/useZakupy.ts` | Dane zakupów, podgląd na żywo, operacje |
| `src/pozycje.ts` | Porządek i liczenie pozycji |
| `src/Tablica.tsx` | Ekran „Tablica": karteczki i przypinanie |
| `src/useTablica.ts` | Dane tablicy i operacje |
| `src/notatki.ts` | Porządek notatek i opis czasu |
| `src/useNaZywo.ts` | Wspólna subskrypcja zmian (Realtime) |
| `src/useWydarzenia.ts` | Pobieranie i zapis wydarzeń |
| `src/MojDom.tsx` | Ekran „Mój dom": domownicy, role, konta |
| `src/useDomownicy.ts` | Wczytywanie i zmiany listy domowników |
| `src/uklad/nawigacja.ts` | Ekrany, tytuły i to, co dodaje przycisk „+" |
| `src/uklad/useTelefon.ts` | Czy ekran jest wąski |
| `src/uklad/UkladTelefon.tsx` | Rama telefonu: górny pasek, dolne zakładki, „+" |
| `src/uklad/UkladBiurko.tsx` | Rama komputera: nagłówek i zakładki u góry |
| `src/uklad/Arkusz.tsx` | Formularz wysuwany z dołu |
| `src/uklad/KontoKarta.tsx` | Konto i wylogowanie na ekranie „Mój dom" |
| `src/style/` | Style rozbite na tokeny, wspólne, powłokę, kalendarz, listy i formularze |
| `src/kolory.ts` | Paleta kolorów domowników |
| `src/dates.ts` | Polskie nazwy miesięcy i dni, budowanie siatki kalendarza |
| `src/lib/supabase.ts` | Połączenie z bazą i typy danych |
| `supabase/schema.sql` | Pełny schemat: tabele, funkcje i reguły dostępu |
| `supabase/start.sql` | Skrypt uruchamiany raz — zakłada pierwszy dom |

## Układ na telefonie

Poniżej 768 px aplikacja przełącza się na osobny układ: cztery zakładki na
dolnym pasku, okrągły przycisk „+" nad nimi i formularze w arkuszu wysuwanym
z dołu. Powyżej tego progu — a więc na tablecie w pionie i na komputerze —
wygląda i działa dokładnie tak, jak wyglądała zawsze.

Nie są to dwie aplikacje. Ekrany (kalendarz, zakupy, tablica, mój dom) to te
same komponenty w obu układach; różni się tylko rama wokół nich —
[`src/uklad/UkladTelefon.tsx`](src/uklad/UkladTelefon.tsx) albo
[`src/uklad/UkladBiurko.tsx`](src/uklad/UkladBiurko.tsx). O tym, co robi „+" na
danym ekranie, rozstrzyga jedno miejsce:
[`src/uklad/nawigacja.ts`](src/uklad/nawigacja.ts).

Kalendarz zachowuje na telefonie wszystkie trzy widoki. Miesiąc pokazuje
w komórce dwie pigułki zamiast trzech, tydzień przewija się w bok z przyklejoną
kolumną godzin.

## Jak działa czas w wydarzeniach

Wydarzenie ma `starts_at` i `ends_at` — kolumny `timestamp` **bez strefy
czasowej**. Aplikacja działa w jednej strefie, więc strefy byłyby tu tylko
źródłem błędów w rodzaju „wakacje zaczynają się 9 lipca o 23:00".

Koniec jest **wyłączny**: wydarzenie trwa do tej chwili, ale jej nie obejmuje.
Dzięki temu spotkanie kończące się o 24:00 nie zajmuje dnia następnego,
a wyjazd 9–11 września zapisuje się jako `09-09 00:00 → 09-12 00:00`.

Czytaj te kolumny przez `zTimestampu()` z `src/czas.ts`, a zapisuj przez
`naTimestamp()` — `new Date(...)` i `toISOString()` przesunęłyby godziny.

Do wydarzenia można przypisać kilka osób — służy do tego tabela łącząca
`event_members`. Blok w kalendarzu bierze kolor od **pierwszej** przypisanej
osoby, a pozostali pokazują się kropkami. „Pierwsza" znaczy pierwsza w kolejności
domowników w domu, nie w kolejności klikania — dzięki temu ta sama para osób
zawsze daje ten sam kolor.

Filtr osób zostawia wydarzenie widoczne, dopóki widoczny jest **choć jeden**
uczestnik. Inaczej wspólny obiad znikałby po ukryciu kogokolwiek z rodziny.

Osoby do wydarzenia dopisuje jego autor albo rodzic. Bez tego ograniczenia
dziecko mogłoby dopisać się do dowolnego cudzego wpisu — a przypisanie daje
prawo do usunięcia wydarzenia.

Wydarzenia cykliczne powstają jako osobne wpisy ze wspólnym `series_id`.
Każde da się zmienić lub usunąć osobno albo razem z kolejnymi. Seria kończy
się na dacie wybranej w polu „powtarzaj do" — po jej upływie trzeba założyć
nową.

## Listy zakupów

Zakładka **Zakupy** trzyma listy domu (domyślnie Spożywcze, Apteka, Dom).
Pozycja to nazwa i opcjonalna ilość jako tekst — „2 l" czy „10 szt." nie mieszczą
się w liczbie, a nikt tego nie sumuje.

Zmiany widać **na żywo** u wszystkich domowników: aplikacja słucha zmian przez
Supabase Realtime, więc dopisanie mleka w domu pojawia się od razu u osoby
stojącej w sklepie. Odhaczenie zapisuje się optymistycznie — checkbox reaguje
natychmiast, nie czeka na serwer.

Listy zakłada i usuwa rodzic. Pozycje dopisuje i odhacza każdy domownik;
usunąć pozycję może jej autor albo rodzic.

## Tablica

Zakładka **Tablica** to rodzinne ogłoszenia na widoku — karteczki z treścią,
autorem i czasem dodania („przed chwilą", „wczoraj", „3 dni temu", potem data).

Ważne rzeczy przypina się na górę; przypięta karteczka bierze barwę autora, żeby
dało się ją wyłowić wzrokiem. Przypiąć może każdy domownik — to porządkowanie
wspólnej tablicy, nie ingerencja w cudzą treść. Usunąć notatkę może jej autor
albo rodzic.

Notatki nie znikają same. Wiszą, dopóki ktoś ich nie zdejmie.

## Podgląd na żywo

Kalendarz, domownicy, zakupy i tablica odświeżają się **bez przeładowania
strony** — aplikacja słucha zmian przez Supabase Realtime. Dopisanie czegoś na
jednym urządzeniu pojawia się na pozostałych w kilka sekund.

Obsługuje to jeden wspólny hook [`src/useNaZywo.ts`](src/useNaZywo.ts). Realtime
respektuje reguły RLS, więc subskrypcja nie jest obejściem uprawnień — kanał nie
przyniesie danych z cudzego domu.

## Role i dostęp

Niezalogowany nie widzi niczego — reguły RLS przyznają dostęp wyłącznie roli
`authenticated`, i tylko do danych własnego domu.

| | rodzic | domownik | dziecko |
| --- | :---: | :---: | :---: |
| Widzi kalendarz domu | ✓ | ✓ | ✓ |
| Dodaje wydarzenia | ✓ | ✓ | ✓ |
| Usuwa swoje wydarzenia | ✓ | ✓ | ✓ |
| Usuwa cudze wydarzenia | ✓ | – | – |
| Zarządza domownikami | ✓ | – | – |

„Swoje wydarzenie" oznacza dodane przez siebie **lub** przypisane sobie.

Domownik nie musi mieć konta — osoba bez adresu e-mail ma imię, kolor i swoje
wydarzenia, ale się nie loguje.

Żeby dać komuś dostęp, wpisz jego adres przy osobie na ekranie „Mój dom".
Gdy ta osoba założy sobie konto tym samym adresem, trafi prosto do Waszego domu
z nadaną rolą. Konto założone adresem, którego nikt nie wpisał, nie widzi żadnych
danych — dostaje tylko propozycję utworzenia własnego domu.

Usunięcie domownika nie kasuje jego wydarzeń — tracą tylko przypisanie do osoby
(w bazie odpowiada za to `on delete set null`).

## Skrypty

| Polecenie | Efekt |
| --- | --- |
| `npm run dev` | Serwer deweloperski z podglądem na żywo |
| `npm run build` | Wersja produkcyjna do katalogu `dist` |
| `npm run preview` | Podgląd zbudowanej wersji |
| `npm run lint` | Sprawdzenie kodu (oxlint) |
| `npm test` | Testy logiki czasu (vitest) |
| `npm run test:watch` | Testy w trybie ciągłym |
