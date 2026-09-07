# Osobny układ na telefon

Data: 2026-09-07
Dotyczy: Kokpit Rodzinny, warstwa wizualna

## Po co

Kokpit jest używany głównie z telefonu — lista zakupów w sklepie, rzut oka na
kalendarz w biegu, notatka na tablicy między jednym a drugim. A układ jest
desktopowy: zakładki u góry, formularze wpisane w stronę, siatka tygodnia
ściśnięta do siedmiu kolumn na 375 px. Poniżej 900 px wszystko się po prostu
zwęża, zamiast zmieniać kształt.

Ta zmiana daje telefonowi **własny układ** — nawigację pod kciukiem, formularze
w wysuwanym arkuszu, siatki przewijane zamiast ściskanych. Komputer zostaje taki,
jaki jest.

## Decyzje

| Kwestia | Wybór |
| --- | --- |
| Zakres | wyłącznie telefon; wygląd na komputerze bez zmian |
| Próg | 768 px — tablet w pionie dostaje układ biurkowy |
| Nawigacja | dolny pasek czterech zakładek |
| Dodawanie | okrągły przycisk „+" nad paskiem, kontekstowy |
| Kalendarz | zostają wszystkie trzy widoki; tydzień przewijany w bok |
| Formularze | arkusz wysuwany z dołu |
| Arkusz | `@radix-ui/react-dialog` — jedyna nowa zależność |
| Struktura | osobna powłoka na telefon i na biurko, wspólne ekrany |
| Style | `App.css` rozbity na pięć plików |
| Tryb ciemny | poza zakresem |

Odrzucone: przebudowa wyglądu na wszystkich urządzeniach (problem dotyczy
telefonu), Tailwind i shadcn (przepisanie 1484 linii stylów przy problemie
z jednym urządzeniem), arkusz zrobiony samym CSS-em (bez pułapki fokusa,
z przewijającym się tłem), agenda zamiast trzech widoków kalendarza.

Odrzucono też dodanie `@testing-library` i `jsdom` — patrz „Weryfikacja".

## Gałąź

`uklad-mobilny`, odbita od `main`. Nie dokładam tego do wstrzymanej gałęzi
`powiadomienia-mailowe`. Skutek: zadanie 7 z planu powiadomień dokłada sekcję
„Powiadomienia" do ekranu „Mój dom", więc po scaleniu obu gałęzi tę jedną sekcję
trzeba będzie wpasować w nowy układ. Kilkanaście linii.

## Podział na kawałki

`App.tsx` ma dziś 428 linii i trzyma stan, nagłówek, zakładki, przełączanie
ekranów, sterowanie kalendarzem i panel z formularzem naraz. Dołożenie drugiego
układu bez podziału daje 600+ linii, w których nie sposób niczego znaleźć.

| Plik | Co wie | Od czego zależy |
| --- | --- | --- |
| `src/uklad/useTelefon.ts` | czy ekran jest wąski | `matchMedia` |
| `src/uklad/nawigacja.ts` | zakładki, etykiety, akcja „+" na ekranie | niczego — czyste funkcje |
| `src/uklad/UkladBiurko.tsx` | dzisiejsza rama: nagłówek, zakładki u góry, konto | `nawigacja.ts` |
| `src/uklad/UkladTelefon.tsx` | rama telefonu: pasek kontekstowy, dolne zakładki, „+" | `nawigacja.ts` |
| `src/uklad/Arkusz.tsx` | arkusz wysuwany z dołu | Radix Dialog |
| `src/App.tsx` | stan i dane; wybiera ramę i wsadza w nią ekran | powyższe |

`Zakupy`, `Tablica`, `MojDom` i widoki kalendarza zostają **tymi samymi
komponentami** w obu układach. Rama wie o urządzeniu, treść nie wie o niczym.
To cała granica tego rozwiązania: piąty ekran dopisuje się raz, nie dwa razy.

Próg 768 px zamiast dzisiejszych 900: tablet w pionie ma miejsce na układ
biurkowy, a dolny pasek na dziesięciu calach wygląda jak pomyłka.

## Ekrany na telefonie

**Kalendarz** zachowuje wszystkie trzy widoki.

- *Miesiąc*: siatka siedmiu kolumn zostaje. W komórce numer dnia i do dwóch
  skróconych pigułek, reszta jako „+3". Stuknięcie dnia rozwija listę
  **pod siatką**, nie w kolejnym arkuszu — dwie warstwy naraz to o jedną
  za dużo.
- *Tydzień*: siatka przewijana poziomo, kolumna godzin i wiersz z nazwami dni
  przyklejone (`position: sticky`), kolumna dnia minimum 88 px.
- *Dzień*: bez zmian, mieści się.

**Filtr osób** przestaje być rzędem przełączników łamiącym się na trzy linie —
staje się paskiem chipów przewijanym poziomo. Tak samo wybór listy w Zakupach.

**Zakupy**: pozycje dostają pole dotyku 44 px. Dziś checkbox ma tyle, ile ma
glif, co przy odhaczaniu jedną ręką w sklepie jest loterią.

**Tablica** i **Mój dom**: jedna kolumna, karty na pełną szerokość, formularze
przeniesione do arkusza pod „+".

**Górny pasek** na telefonie mieści tylko to, co dotyczy bieżącego ekranu:
nazwę ekranu albo — na kalendarzu — zakres dat ze strzałkami i przełącznik
widoków. Tytuł „Kokpit Rodzinny", podtytuł, kropka z imieniem i „Wyloguj"
znikają z paska i przenoszą się na ekran **Mój dom**, na samą górę. Na 375 px
nagłówek zajmujący ćwierć ekranu, żeby przypomnieć, w jakiej się jest
aplikacji, to zmarnowane miejsce.

**Przycisk „+" jest kontekstowy**: kalendarz → wydarzenie, zakupy → pozycja do
wybranej listy, tablica → notatka, Mój dom → domownik. Komu nie wolno dodawać,
temu przycisk **znika**, zamiast pokazywać błąd po kliknięciu. Rozstrzyga o tym
`nawigacja.ts` — jedno miejsce, nie cztery.

## Jak „+" z ramy otwiera formularz w ekranie

Przycisk siedzi w ramie, a formularz potrzebuje stanu, który należy do ekranu —
przy zakupach to wybrana lista, przy kalendarzu zaznaczony dzień. Rama nie może
tego wiedzieć i nie powinna.

Dlatego `App` trzyma jedno pole stanu: `dodawanie: Ekran | null`. „+" ustawia je
na bieżący ekran, a każdy ekran dostaje dwa propsy:

```ts
dodawanieOtwarte: boolean
onZamknijDodawanie: () => void
```

Ekran sam renderuje swój formularz wewnątrz `<Arkusz>` i sam wie, do której
listy dopisać pozycję. Rama zna tylko fakt „ktoś chce coś dodać".

Na komputerze `dodawanie` pozostaje nieużywane — formularze są tam widoczne
na stałe, tak jak dziś.

## Arkusz

`Arkusz.tsx` opakowuje `@radix-ui/react-dialog` (~10 kB). Stamtąd biorą się
pułapka fokusa, Escape, `aria-modal`, blokada przewijania tła i przywrócenie
fokusa po zamknięciu. Napisane ręcznie zajęłyby dzień i wyszłyby gorzej.

Nasze jest ubranie: wysuwanie od dołu, `max-height: 90dvh`, własne przewijanie
w środku, uchwyt i krzyżyk.

**Uchwyt jest ozdobą.** Arkusz zamyka się krzyżykiem, stuknięciem w tło
i Escape'em; przeciągnięcie palcem w dół wymagałoby biblioteki gestów i tego nie
robimy.

Na komputerze arkusz się nie pojawia — formularz zostaje w panelu bocznym
dokładnie tam, gdzie jest dziś.

`index.html` dostaje `viewport-fit=cover`. Bez tego `env(safe-area-inset-bottom)`
zwraca zero i dolny pasek wchodzi pod pasek gestów iPhone'a.

## Style

`App.css` znika. Jego treść rozchodzi się na pięć plików spinanych przez
`src/style/index.css`:

| Plik | Zawartość |
| --- | --- |
| `tokeny.css` | zmienne |
| `powloka.css` | nagłówek, zakładki, dolny pasek, „+", arkusz |
| `kalendarz.css` | siatki miesiąca, tygodnia i dnia |
| `listy.css` | zakupy, tablica, mój dom |
| `formularze.css` | pola, przyciski, paleta kolorów |

**Podział jest przeprowadzką, nie remontem.** Reguły przenoszą się dosłownie,
w osobnym commicie, po którym nic nie wygląda inaczej. Restylowanie zaczyna się
dopiero w kolejnych commitach. Pomieszanie tych dwóch rzeczy to najpewniejszy
sposób, żeby po tygodniu nie wiedzieć, która linia zepsuła widok na komputerze.

Do trzynastu istniejących zmiennych dochodzą:

```css
--odstep-1: 4px;  --odstep-2: 8px;  --odstep-3: 12px;
--odstep-4: 16px; --odstep-5: 24px;
--promien-s: 6px; --promien-m: 10px; --promien-l: 16px;
--dotyk: 44px;          /* minimalne pole dotyku */
--pasek: 56px;          /* wysokość dolnego paska */
--warstwa-pasek: 20;
--warstwa-arkusz: 30;
```

Bez tego „44 px" wyląduje wpisane na sztywno w piętnastu miejscach.

## Dostępność

Dolny pasek to `<nav aria-label="Główna">` z `aria-current="page"` na aktywnej
zakładce — nie `aria-pressed`, bo to nawigacja, a nie przełącznik. (Dzisiejsze
górne zakładki używają `aria-pressed`; przy okazji poprawiamy je tak samo.)

Przycisk „+" ma etykietę zmienną wraz z ekranem („Dodaj wydarzenie", „Dodaj
pozycję"), bo sam plus nie mówi czytnikowi ekranu niczego.

Pola dotyku minimum 44×44. `100dvh` zamiast `100vh`, żeby pasek adresu Safari
nie zjadał dolnego paska.

## Weryfikacja

Testy jednostkowe obejmują `nawigacja.ts`: lista zakładek, etykieta i akcja „+"
na każdym z czterech ekranów, brak przycisku w „Mój dom" dla osoby bez roli
rodzica. To jedyna logika w tej zmianie.

`@testing-library` i `jsdom` **nie wchodzą**. Test sprawdzający, czy arkusz się
wysuwa, kosztowałby więcej niż obejrzenie go, a dawałby pozorną pewność.

Ręcznie:

- szerokości 360, 390 i 430 px w narzędziach przeglądarki oraz prawdziwy telefon,
- arkusz: otwarcie, Escape, stuknięcie w tło, fokus uwięziony w środku i wrócony
  na przycisk po zamknięciu, klawiatura ekranowa nie zasłania pól,
- **powyżej 768 px nic się nie ruszyło** — to główne ryzyko tej zmiany,
- `npm run build`, `npm run lint`, `npm test`.

## Świadomie pomijam

Tryb ciemny, PWA i instalację na ekranie głównym, gesty (przeciągnięcie arkusza,
przesuwanie między ekranami), animacje przejść między zakładkami, zmianę palety
i typografii, przebudowę wyglądu na komputerze.

Tryb ciemny jest najbliższym sensownym następnym krokiem — nowe zmienne
w `tokeny.css` są tak dobrane, żeby dało się go dołożyć bez ruszania reszty.
