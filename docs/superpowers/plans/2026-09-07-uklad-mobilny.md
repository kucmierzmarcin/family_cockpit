# Osobny układ na telefon — plan wdrożenia

> **Dla agentów:** WYMAGANY SUB-SKILL: użyj `superpowers:subagent-driven-development`
> (zalecane) albo `superpowers:executing-plans`, żeby wykonać ten plan zadanie po
> zadaniu. Kroki mają checkboxy (`- [ ]`) do odhaczania.

**Cel:** Dać telefonowi własny układ — dolny pasek zakładek pod kciukiem,
kontekstowy przycisk „+", formularze w arkuszu wysuwanym z dołu, siatki
przewijane zamiast ściskanych — nie ruszając tego, jak aplikacja wygląda na
komputerze.

**Architektura:** Dwie powłoki (`UkladBiurko`, `UkladTelefon`) wybierane hookiem
`useTelefon()` na `matchMedia`; ekrany zostają tymi samymi komponentami w obu.
Formularze na telefonie renderują się wewnątrz `Arkusz` opartego na Radix
Dialog. `App.css` rozchodzi się na sześć plików osobnym commitem, który niczego
nie zmienia w wyglądzie.

**Stack:** React 19, TypeScript, Vite 8, vitest 5, `@radix-ui/react-dialog`,
czysty CSS ze zmiennymi (bez frameworka).

**Spec:** [`docs/superpowers/specs/2026-09-07-uklad-mobilny-design.md`](../specs/2026-09-07-uklad-mobilny-design.md)

## Ograniczenia globalne

- Gałąź: `uklad-mobilny`, odbita od `main`. Nie mieszać z `powiadomienia-mailowe`.
- **Próg telefonu: 768 px.** Układ telefonu obowiązuje przy `max-width: 767px`.
  Powyżej ma być dokładnie to, co dziś.
- **Wygląd na komputerze nie zmienia się.** Każde zadanie kończy się
  sprawdzeniem szerokości ≥ 768 px. To główne ryzyko całej zmiany.
- Nazwy plików, komponentów, zmiennych i klas CSS po polsku — tak jest w całym
  repo (`Zakupy`, `useDomownicy`, `.karteczka`, `--akcent`).
- Minimalne pole dotyku: **44 × 44 px**, przez zmienną `--dotyk`.
- Jedyna nowa zależność w całym planie to `@radix-ui/react-dialog`. Nic więcej
  nie dochodzi — w szczególności ani `@testing-library`, ani `jsdom`.
- Testy uruchamiamy `npm test`, lint `npm run lint`, build `npm run build`.
  Wszystkie trzy muszą przechodzić przed każdym commitem.
- Commity po polsku, **bez polskich znaków** w treści (tak wyglądają
  dotychczasowe), stopka
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Katalog `.superpowers/` to scratchpad — nigdy go nie commituj.

---

## Struktura plików

### Nowe

| Plik | Odpowiedzialność |
| --- | --- |
| `src/uklad/nawigacja.ts` | czyste funkcje: ekrany, tytuły, etykieta „+", typ trybu dodawania |
| `src/uklad/nawigacja.test.ts` | testy powyższego |
| `src/uklad/useTelefon.ts` | jedno: czy ekran jest wąski |
| `src/uklad/Arkusz.tsx` | arkusz wysuwany z dołu (Radix Dialog) |
| `src/uklad/UkladBiurko.tsx` | dzisiejsza rama: nagłówek, zakładki u góry, konto |
| `src/uklad/UkladTelefon.tsx` | rama telefonu: górny pasek, dolne zakładki, „+" |
| `src/uklad/KontoKarta.tsx` | imię, adres i „Wyloguj" — na telefonie u góry „Mój dom" |
| `src/widoki/SterowanieKalendarza.tsx` | strzałki, zakres dat, „Dziś", przełącznik widoków |
| `src/style/tokeny.css` | zmienne i `body` |
| `src/style/wspolne.css` | prymitywy używane przez wszystkie ekrany |
| `src/style/powloka.css` | nagłówek, zakładki, dolny pasek, „+", arkusz, brama |
| `src/style/kalendarz.css` | siatki miesiąca, tygodnia i dnia, filtry osób |
| `src/style/listy.css` | zakupy, tablica, mój dom |
| `src/style/formularze.css` | pola, przyciski, paleta kolorów |
| `src/style/index.css` | spina powyższe w jednej kolejności |

### Zmieniane

| Plik | Zmiana |
| --- | --- |
| `src/App.tsx` | wybór powłoki, stan `dodawanie`, przekazanie trybu do ekranów |
| `src/Zakupy.tsx` | formularz pozycji w arkuszu albo wbudowany |
| `src/Tablica.tsx` | wydzielenie `FormularzNotatki`, arkusz albo wbudowany |
| `src/MojDom.tsx` | formularz osoby w arkuszu albo wbudowany |
| `src/widoki/Miesiac.tsx` | liczba pigułek w komórce z propsa, nie ze stałej |
| `index.html` | `viewport-fit=cover` |
| `package.json` | `@radix-ui/react-dialog` |
| `README.md` | akapit o układzie na telefonie |

### Usuwane

`src/App.css` — jego treść rozchodzi się do `src/style/`.

**Odstępstwo od specu:** spec wymienia pięć plików stylów, plan ma sześć.
Przy mapowaniu 203 klas okazało się, że `.karta`, `.panel-tytul`, `.panel-dzien`,
`.pusto`, `.lista`, `.kropka`, `.usun`, `.drobny`, `.meta` i `.autor` są używane
przez wszystkie cztery ekrany naraz. Wciśnięte do `listy.css` byłyby kłamstwem
w nazwie pliku, a w `tokeny.css` — śmieciem. Dostają własny `wspolne.css`.

---

### Zadanie 1: Podział App.css — przeprowadzka, nie remont

**Pliki:**
- Utworzenie: `src/style/{tokeny,wspolne,powloka,kalendarz,listy,formularze,index}.css`
- Usunięcie: `src/App.css`
- Modyfikacja: `src/App.tsx` (linia 24, import stylu)

**Interfejsy:**
- Produkuje: `src/style/index.css` jako jedyny punkt wejścia stylów.

**To zadanie nie ma prawa zmienić wyglądu czegokolwiek.** Reguły przenoszą się
dosłownie — bez poprawiania, skracania, scalania i porządkowania. Weryfikacja
w krokach 2 i 7 to sprawdza mechanicznie.

- [ ] **Krok 1: Zbuduj stan wyjściowy i zapisz wzorzec**

```bash
mkdir -p node_modules/.tmp/css
npm run build
cp dist/assets/*.css node_modules/.tmp/css/przed.css
```

- [ ] **Krok 2: Przygotuj narzędzie do porównania**

```bash
cat > node_modules/.tmp/css/reguly.mjs <<'EOF'
// Wypisuje reguly CSS posortowane alfabetycznie, bez bialych znakow
// i komentarzy. Przeniesienie reguly do innego pliku nie zmienia wyniku,
// zmiana jej tresci - zmienia.
import { readFileSync } from 'node:fs'

const reguly = readFileSync(process.argv[2], 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('}')
  .map((r) => r.replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .sort()

console.log(reguly.join('\n'))
EOF

node node_modules/.tmp/css/reguly.mjs node_modules/.tmp/css/przed.css \
  > node_modules/.tmp/css/przed.txt
wc -l node_modules/.tmp/css/przed.txt
```

Zapisz sobie tę liczbę linii.

Zastrzeżenie: bloki `@media` zawierają zagnieżdżone `}`, więc dzielenie po `}`
je poszatkuje — ale tak samo po obu stronach porównania, więc różnica i tak
wychwyci każdą zmienioną, dodaną i usuniętą deklarację.

- [ ] **Krok 3: Rozpisz reguły do sześciu plików**

Otwórz `src/App.css` i przenieś **każdą regułę** do jednego z plików poniżej.
Wewnątrz pliku docelowego zachowaj **oryginalną kolejność** — czyli sortuj
według numeru linii, z której reguła pochodzi. To nie jest kosmetyka:
`.sg-blok-godzina` występuje w tym pliku dwa razy (linie 956 i 1104),
`.lista .wpis` też (1035 i 1054), a druga deklaracja nadpisuje pierwszą.

`src/style/tokeny.css` — `:root`, `body`

`src/style/wspolne.css` — `.karta`, `.panel`, `.panel-tytul`, `.panel-dzien`,
`.pusto`, `.lista`, `.lista li`, `.lista .wpis` (oba wystąpienia),
`.lista li:has(.wpis)`, `.czas`, `.nazwa`, `.usun`, `.usun:hover`,
`.usun:disabled`, `.kropka`, `.kropka-pusta`, `.kropka.mala`, `.meta`,
`.to-ja`, `.drobny`, `.drobny:hover`, `.autor`, `.uczestnicy`,
`.uczestnicy .autor`, `.blad`

`src/style/powloka.css` — `.kokpit`, `.naglowek`, `.naglowek h1`, `.podtytul`,
`.uklad`, `.pasek`, `.zakladki`, `.zakladki.rowne`, `.zakladki.rowne .zakladka`,
`.zakladka`, `.zakladka:hover`, `.zakladka.aktywna`, `.konto`, `.konto-kto`,
`.konto-kto .meta`, `.brama`, `.brama-karta`, `.brama-karta h1`,
`.brama-karta .podtytul`, `.brama-karta .formularz`, `.brama-karta .blad`,
`.brama-karta b`, `.brama-stopka`, `.wskazowka`

`src/style/kalendarz.css` — `.kalendarz`, `.sterowanie`, `.miesiac`,
`.strzalka`, `.strzalka:hover`, `.dzis`, `.dzis:hover`, `.dni-tygodnia`,
`.dni-tygodnia span`, `.siatka`, `.siatka.wczytywanie`, `.dzien` i wszystkie
`.dzien.*`, `.numer`, `.wydarzenia`, `.pigulka`, `.pigulka b`, `.pigulka.ciagle`,
`.wiecej`, `.zakladki.widoki`, `.filtry`, `.filtr`, `.filtr.wlaczony`,
`.filtr:hover`, `.kropki-osob`, wszystkie `.sg-*` (oba wystąpienia
`.sg-blok-godzina`)

`src/style/listy.css` — `.dom`, `.lista-osob`, `.lista-osob li`,
`.lista-osob li.osoba-edycja`, `.zakupy`, `.listy-pasek`,
`.listy-pasek .zakladka`, `.licznik`, `.zakladka.aktywna .licznik`,
`.naglowek-listy`, `.naglowek-listy .panel-tytul`, `.naglowek-listy .meta`,
`.pozycje`, `.pozycje li`, `.pozycje li:hover`, `.pozycje li.kupione`,
`.pozycje li.kupione .pozycja-nazwa`, `.pozycja-tresc`,
`.pozycja-tresc input[type='checkbox']`, `.pozycja-nazwa`, `.pozycja-ilosc`,
`.tablica`, `.karteczki`, `.karteczka`, `.karteczka.przypieta`,
`.znacznik-przypiecia`, `.tresc-karteczki`, `.stopka-karteczki`,
`.autor-karteczki`, `.karteczka.przypieta .autor-karteczki`,
`.stopka-karteczki .drobny`

`src/style/formularze.css` — `.formularz` i wszystkie `.formularz *`,
`.etykieta-koloru`, `.paleta`, `.kolor`, `.kolor:hover`, `.kolor.aktywny`,
`.osoba-edycja .formularz`, `.formularz-wydarzenia`,
`.formularz-wydarzenia .panel-tytul`, `.para-pol`, `.para-pol input`,
`.wybor-zakresu`, `.wybor-zakresu .przelacznik`, `.wybor-osob`,
`.formularz .wybor-osob .filtr` i jego warianty, `.formularz-listy`,
`.formularz-pozycji` i ich warianty, `.pole-ilosci`, `.formularz-notatki`
i wszystkie `.formularz-notatki *`

Każdy z czterech bloków `@media` z `App.css` (linie 379, 730, 1077, 1348)
rozbij tak samo — reguły w nim zawarte idą do pliku właściwego dla swojego
selektora, opakowane we własny `@media` na końcu tego pliku.

- [ ] **Krok 4: Napisz plik spinający**

`src/style/index.css`:

```css
/* Kolejność ma znaczenie: tokeny muszą być pierwsze, a prymitywy przed tym,
   co je nadpisuje. Ekrany na końcu, bo najbardziej szczegółowe. */
@import './tokeny.css';
@import './wspolne.css';
@import './powloka.css';
@import './kalendarz.css';
@import './listy.css';
@import './formularze.css';
```

- [ ] **Krok 5: Przełącz import w App.tsx**

W `src/App.tsx` zamień linię 24:

```ts
import './App.css'
```

na:

```ts
import './style/index.css'
```

- [ ] **Krok 6: Usuń stary plik**

```bash
rm src/App.css
```

- [ ] **Krok 7: Porównaj wynik z wzorcem — to jest sedno tego zadania**

```bash
npm run build
cp dist/assets/*.css node_modules/.tmp/css/po.css
node node_modules/.tmp/css/reguly.mjs node_modules/.tmp/css/po.css \
  > node_modules/.tmp/css/po.txt
diff node_modules/.tmp/css/przed.txt node_modules/.tmp/css/po.txt && echo "BEZ ROZNIC"
```

Oczekiwane: `BEZ ROZNIC` i pusty wynik `diff`.

Jeśli `diff` cokolwiek pokazuje, znaczy że reguła zniknęła, doszła albo zmieniła
treść — znajdź ją i przywróć. Nie przechodź dalej z niepustą różnicą.

- [ ] **Krok 8: Obejrzyj aplikację na szerokim ekranie**

```bash
npm run dev
```

Przy szerokości okna ≥ 1000 px przejdź przez cztery ekrany: kalendarz (miesiąc,
tydzień, dzień), zakupy, tablica, mój dom. Ma wyglądać identycznie jak przed
zmianą.

- [ ] **Krok 9: Lint, testy, commit**

```bash
npm run lint && npm test
git add src/style src/App.tsx
git add -u src/App.css
git commit -m "Podzial App.css na szesc plikow bez zmian w wygladzie"
```

---

### Zadanie 2: Logika nawigacji

**Pliki:**
- Utworzenie: `src/uklad/nawigacja.ts`
- Test: `src/uklad/nawigacja.test.ts`
- Modyfikacja: `src/App.tsx` (usunięcie lokalnego `type Ekran`, import z nowego pliku)

**Interfejsy:**
- Produkuje:
  - `type Ekran = 'kalendarz' | 'zakupy' | 'tablica' | 'dom'`
  - `const EKRANY: Ekran[]`
  - `const TYTULY: Record<Ekran, string>`
  - `function etykietaDodania(ekran: Ekran, jestemRodzicem: boolean): string | null`
  - `type TrybDodawania = { otwarte: boolean; onZamknij: () => void } | null`

- [ ] **Krok 1: Napisz testy**

Utwórz `src/uklad/nawigacja.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { EKRANY, TYTULY, etykietaDodania } from './nawigacja'

describe('EKRANY', () => {
  it('cztery ekrany w kolejności zakładek', () => {
    expect(EKRANY).toEqual(['kalendarz', 'zakupy', 'tablica', 'dom'])
  })

  it('każdy ekran ma tytuł', () => {
    for (const e of EKRANY) {
      expect(TYTULY[e]).toBeTruthy()
    }
  })
})

describe('etykietaDodania', () => {
  it('mówi, co doda przycisk na danym ekranie', () => {
    expect(etykietaDodania('kalendarz', false)).toBe('Dodaj wydarzenie')
    expect(etykietaDodania('zakupy', false)).toBe('Dodaj pozycję')
    expect(etykietaDodania('tablica', false)).toBe('Dodaj notatkę')
  })

  it('domownika dodaje tylko rodzic', () => {
    expect(etykietaDodania('dom', true)).toBe('Dodaj domownika')
    expect(etykietaDodania('dom', false)).toBeNull()
  })

  it('rola nie zmienia nic poza ekranem „Mój dom"', () => {
    for (const e of ['kalendarz', 'zakupy', 'tablica'] as const) {
      expect(etykietaDodania(e, true)).toBe(etykietaDodania(e, false))
    }
  })
})
```

- [ ] **Krok 2: Uruchom testy i upewnij się, że padają**

```bash
npm test -- nawigacja
```

Oczekiwane: FAIL, `Failed to resolve import "./nawigacja"`.

- [ ] **Krok 3: Napisz moduł**

Utwórz `src/uklad/nawigacja.ts`:

```ts
/**
 * Co jest w nawigacji i co robi przycisk „+" na danym ekranie.
 *
 * Czyste funkcje, bez Reacta - żeby obie powłoki (telefon i biurko) brały te
 * same odpowiedzi z jednego miejsca, a nie każda ze swojego.
 */

export type Ekran = 'kalendarz' | 'zakupy' | 'tablica' | 'dom'

/** Kolejność zakładek - ta sama u góry na biurku i na dole na telefonie. */
export const EKRANY: Ekran[] = ['kalendarz', 'zakupy', 'tablica', 'dom']

export const TYTULY: Record<Ekran, string> = {
  kalendarz: 'Kalendarz',
  zakupy: 'Zakupy',
  tablica: 'Tablica',
  dom: 'Mój dom',
}

/**
 * Etykieta przycisku „+", albo `null`, gdy na tym ekranie nie wolno dodawać.
 * Sam plus nie mówi czytnikowi ekranu niczego, więc etykieta jest wymagana,
 * nie ozdobna. `null` znaczy: nie pokazuj przycisku wcale - lepiej niż błąd
 * po kliknięciu.
 */
export function etykietaDodania(ekran: Ekran, jestemRodzicem: boolean): string | null {
  switch (ekran) {
    case 'kalendarz':
      return 'Dodaj wydarzenie'
    case 'zakupy':
      return 'Dodaj pozycję'
    case 'tablica':
      return 'Dodaj notatkę'
    case 'dom':
      return jestemRodzicem ? 'Dodaj domownika' : null
  }
}

/**
 * Jak ekran ma pokazać swój formularz dodawania.
 *
 * `null` - wbudowany w stronę, tak jak dziś na komputerze.
 * Obiekt - w arkuszu, sterowanym z powłoki telefonu.
 */
export type TrybDodawania = { otwarte: boolean; onZamknij: () => void } | null
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm test -- nawigacja
```

Oczekiwane: PASS, 5 testów.

- [ ] **Krok 5: Przepnij App.tsx na wspólny typ**

W `src/App.tsx` usuń linię `type Ekran = 'kalendarz' | 'dom' | 'zakupy' | 'tablica'`
i dodaj do importów:

```ts
import type { Ekran } from './uklad/nawigacja'
```

- [ ] **Krok 6: Lint, testy, build, commit**

```bash
npm run lint && npm test && npm run build
git add src/uklad src/App.tsx
git commit -m "Logika nawigacji w jednym miejscu"
```

---

### Zadanie 3: Wykrywanie telefonu i arkusz

**Pliki:**
- Utworzenie: `src/uklad/useTelefon.ts`
- Utworzenie: `src/uklad/Arkusz.tsx`
- Modyfikacja: `index.html` (meta viewport)
- Modyfikacja: `package.json` (zależność)
- Modyfikacja: `src/style/powloka.css` (style arkusza)

**Interfejsy:**
- Produkuje:
  - `const PROG_TELEFONU = 768`
  - `function useTelefon(): boolean`
  - `function Arkusz(props: { otwarty: boolean; tytul: string; onZamknij: () => void; children: ReactNode })`

- [ ] **Krok 1: Zainstaluj zależność**

```bash
npm install @radix-ui/react-dialog
```

- [ ] **Krok 2: Napisz hook**

Utwórz `src/uklad/useTelefon.ts`:

```ts
import { useEffect, useState } from 'react'

/**
 * Poniżej tego progu wchodzi układ telefonu. 768, a nie dzisiejsze 900:
 * tablet w pionie ma miejsce na układ biurkowy, a dolny pasek na dziesięciu
 * calach wygląda jak pomyłka.
 */
export const PROG_TELEFONU = 768

const ZAPYTANIE = `(max-width: ${PROG_TELEFONU - 1}px)`

export function useTelefon(): boolean {
  const [telefon, setTelefon] = useState(() => window.matchMedia(ZAPYTANIE).matches)

  useEffect(() => {
    const zapytanie = window.matchMedia(ZAPYTANIE)
    const reaguj = (e: MediaQueryListEvent) => setTelefon(e.matches)

    zapytanie.addEventListener('change', reaguj)
    // Szerokość mogła się zmienić między pierwszym renderem a podpięciem
    // nasłuchu - np. przy obrocie telefonu w trakcie ładowania.
    setTelefon(zapytanie.matches)

    return () => zapytanie.removeEventListener('change', reaguj)
  }, [])

  return telefon
}
```

- [ ] **Krok 3: Napisz arkusz**

Utwórz `src/uklad/Arkusz.tsx`:

```tsx
import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

type Props = {
  otwarty: boolean
  tytul: string
  onZamknij: () => void
  children: ReactNode
}

/**
 * Formularz wysuwany z dołu ekranu.
 *
 * Pułapka fokusa, Escape, `aria-modal`, blokada przewijania tła i przywrócenie
 * fokusa po zamknięciu przychodzą z Radiksa. Napisane ręcznie zajęłyby dzień
 * i wyszłyby gorzej.
 *
 * Uchwyt u góry jest ozdobą: arkusz zamyka krzyżyk, stuknięcie w tło i Escape.
 * Przeciągnięcie palcem w dół wymagałoby biblioteki gestów.
 */
export function Arkusz({ otwarty, tytul, onZamknij, children }: Props) {
  return (
    <Dialog.Root
      open={otwarty}
      onOpenChange={(otwiera) => {
        if (!otwiera) onZamknij()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="arkusz-tlo" />
        {/* aria-describedby={undefined} wycisza ostrzeżenie Radiksa o braku
            opisu - tytuł wystarcza, a zmyślony opis tylko zaśmieca odczyt. */}
        <Dialog.Content className="arkusz" aria-describedby={undefined}>
          <span className="arkusz-uchwyt" aria-hidden="true" />
          <div className="arkusz-pasek">
            <Dialog.Title className="panel-tytul">{tytul}</Dialog.Title>
            <Dialog.Close className="drobny arkusz-zamknij" aria-label="Zamknij">
              ×
            </Dialog.Close>
          </div>
          <div className="arkusz-tresc">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Krok 4: Dopisz style arkusza**

Na końcu `src/style/powloka.css`:

```css
/* Arkusz pokazuje się wyłącznie na telefonie - na biurku formularze zostają
   wbudowane w stronę, więc Arkusz w ogóle się tam nie renderuje. */
.arkusz-tlo {
  position: fixed;
  inset: 0;
  background: rgba(16, 12, 30, 0.4);
  z-index: var(--warstwa-arkusz);
}

.arkusz {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--warstwa-arkusz);
  display: flex;
  flex-direction: column;
  /* dvh, nie vh: pasek adresu Safari zmienia vh i arkusz wystawałby poza ekran */
  max-height: 90dvh;
  padding: var(--odstep-2) var(--odstep-4)
    calc(var(--odstep-4) + env(safe-area-inset-bottom));
  background: var(--karta);
  border-radius: var(--promien-l) var(--promien-l) 0 0;
  box-shadow: var(--cien);
}

.arkusz-uchwyt {
  width: 36px;
  height: 4px;
  margin: 0 auto var(--odstep-2);
  border-radius: 999px;
  background: var(--kreska);
}

.arkusz-pasek {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--odstep-3);
  margin-bottom: var(--odstep-3);
}

.arkusz-zamknij {
  min-width: var(--dotyk);
  min-height: var(--dotyk);
  font-size: 24px;
  line-height: 1;
}

/* Przewija się środek arkusza, nie strona pod nim. */
.arkusz-tresc {
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

- [ ] **Krok 5: Dodaj brakujące zmienne**

W `src/style/tokeny.css`, w bloku `:root`, po istniejących zmiennych:

```css
  --odstep-1: 4px;
  --odstep-2: 8px;
  --odstep-3: 12px;
  --odstep-4: 16px;
  --odstep-5: 24px;
  --promien-s: 6px;
  --promien-m: 10px;
  --promien-l: 16px;
  --dotyk: 44px;
  --pasek: 56px;
  --warstwa-pasek: 20;
  --warstwa-arkusz: 30;
```

- [ ] **Krok 6: Popraw meta viewport**

W `index.html` zamień:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

na:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

Bez `viewport-fit=cover` funkcja `env(safe-area-inset-bottom)` zwraca zero
i dolny pasek wchodzi pod pasek gestów iPhone'a.

- [ ] **Krok 7: Lint, testy, build, commit**

```bash
npm run lint && npm test && npm run build
git add src/uklad src/style index.html package.json package-lock.json
git commit -m "Wykrywanie telefonu i arkusz wysuwany z dolu"
```

Arkusz nie jest jeszcze nigdzie użyty — to zadanie 5.

---

### Zadanie 4: Dwie powłoki

**Pliki:**
- Utworzenie: `src/uklad/UkladBiurko.tsx`
- Utworzenie: `src/uklad/UkladTelefon.tsx`
- Utworzenie: `src/uklad/KontoKarta.tsx`
- Utworzenie: `src/widoki/SterowanieKalendarza.tsx`
- Modyfikacja: `src/App.tsx`
- Modyfikacja: `src/style/powloka.css`

**Interfejsy:**
- Konsumuje: `EKRANY`, `TYTULY`, `etykietaDodania`, `Ekran` (zadanie 2), `useTelefon` (zadanie 3).
- Produkuje:
  - `UkladBiurko({ profil, email, ekran, onEkran, children })`
  - `UkladTelefon({ ekran, onEkran, jestemRodzicem, gorny, onDodaj, children })`
  - `KontoKarta({ profil, email })`
  - `SterowanieKalendarza({ naglowek, widok, onWidok, onPrzesun, onDzis })`

- [ ] **Krok 1: Wydziel sterowanie kalendarza**

Utwórz `src/widoki/SterowanieKalendarza.tsx`, przenosząc tam JSX z `App.tsx`
z linii 225-259 (blok `.sterowanie` i blok `.zakladki.widoki`):

```tsx
export type Widok = 'miesiac' | 'tydzien' | 'dzien'

export const NAZWY_WIDOKOW: Record<Widok, string> = {
  miesiac: 'Miesiąc',
  tydzien: 'Tydzień',
  dzien: 'Dzień',
}

type Props = {
  naglowek: string
  widok: Widok
  onWidok: (w: Widok) => void
  onPrzesun: (kierunek: -1 | 1) => void
  onDzis: () => void
}

/**
 * Strzałki, zakres dat, „Dziś" i przełącznik widoków. Wydzielone, bo na
 * komputerze siedzą nad siatką, a na telefonie w górnym pasku - i mają być
 * tym samym kodem, nie dwiema kopiami.
 */
export function SterowanieKalendarza({
  naglowek,
  widok,
  onWidok,
  onPrzesun,
  onDzis,
}: Props) {
  return (
    <>
      <div className="sterowanie">
        <button
          type="button"
          className="strzalka"
          onClick={() => onPrzesun(-1)}
          aria-label="Wstecz"
        >
          ‹
        </button>
        <h2 className="miesiac">{naglowek}</h2>
        <button
          type="button"
          className="strzalka"
          onClick={() => onPrzesun(1)}
          aria-label="Dalej"
        >
          ›
        </button>
        <button type="button" className="dzis" onClick={onDzis}>
          Dziś
        </button>
      </div>

      <div className="zakladki widoki" role="group" aria-label="Zakres widoku">
        {(Object.keys(NAZWY_WIDOKOW) as Widok[]).map((w) => (
          <button
            key={w}
            type="button"
            className={`zakladka${widok === w ? ' aktywna' : ''}`}
            aria-pressed={widok === w}
            onClick={() => onWidok(w)}
          >
            {NAZWY_WIDOKOW[w]}
          </button>
        ))}
      </div>
    </>
  )
}
```

W `App.tsx` usuń lokalny `type Widok`, lokalną stałą `NAZWY_WIDOKOW` i ten
fragment JSX; zaimportuj `SterowanieKalendarza`, `NAZWY_WIDOKOW` i typ `Widok`
z nowego pliku, a w miejscu usuniętego JSX wstaw:

```tsx
<SterowanieKalendarza
  naglowek={naglowek}
  widok={widok}
  onWidok={setWidok}
  onPrzesun={przesun}
  onDzis={() => setKotwica(new Date())}
/>
```

- [ ] **Krok 2: Napisz kartę konta**

Utwórz `src/uklad/KontoKarta.tsx`:

```tsx
import type { DomownikDb } from '../lib/supabase'
import { kolor } from '../kolory'
import { wyloguj } from '../auth/useSesja'

type Props = { profil: DomownikDb; email: string }

/**
 * Kto jest zalogowany i przycisk wylogowania. Na komputerze to część nagłówka;
 * na telefonie nagłówek znika, więc karta ląduje na górze ekranu „Mój dom" -
 * tam, gdzie i tak szuka się spraw konta.
 */
export function KontoKarta({ profil, email }: Props) {
  return (
    <section className="karta konto-karta">
      <span className="konto-kto">
        <span
          className="kropka"
          style={{ background: kolor(profil.color).kropka }}
          aria-hidden="true"
        />
        {profil.name}
        <span className="meta">{email}</span>
      </span>
      <button type="button" className="drobny" onClick={() => void wyloguj()}>
        Wyloguj
      </button>
    </section>
  )
}
```

- [ ] **Krok 3: Napisz powłokę biurkową**

Utwórz `src/uklad/UkladBiurko.tsx`, przenosząc nagłówek z `App.tsx`
(linie 138-195). Jedna zmiana wobec oryginału: `aria-pressed` na zakładkach
zamienia się na `aria-current`, bo to nawigacja, a nie przełącznik.

```tsx
import type { ReactNode } from 'react'
import type { DomownikDb } from '../lib/supabase'
import { kolor } from '../kolory'
import { wyloguj } from '../auth/useSesja'
import { EKRANY, TYTULY, type Ekran } from './nawigacja'

type Props = {
  profil: DomownikDb
  email: string
  ekran: Ekran
  onEkran: (e: Ekran) => void
  children: ReactNode
}

/** Rama na komputerze: nagłówek z zakładkami u góry i kontem po prawej. */
export function UkladBiurko({ profil, email, ekran, onEkran, children }: Props) {
  return (
    <div className="kokpit">
      <header className="naglowek">
        <div className="pasek">
          <nav className="zakladki" aria-label="Ekran">
            {EKRANY.map((e) => (
              <button
                key={e}
                type="button"
                className={`zakladka${ekran === e ? ' aktywna' : ''}`}
                aria-current={ekran === e ? 'page' : undefined}
                onClick={() => onEkran(e)}
              >
                {TYTULY[e]}
              </button>
            ))}
          </nav>

          <div className="konto">
            <span className="konto-kto">
              <span
                className="kropka"
                style={{ background: kolor(profil.color).kropka }}
                aria-hidden="true"
              />
              {profil.name}
              <span className="meta">{email}</span>
            </span>
            <button type="button" className="drobny" onClick={() => void wyloguj()}>
              Wyloguj
            </button>
          </div>
        </div>

        <h1>Kokpit Rodzinny</h1>
        <p className="podtytul">Wspólny kalendarz całej rodziny</p>
      </header>

      {children}
    </div>
  )
}
```

- [ ] **Krok 4: Napisz powłokę telefonu**

Utwórz `src/uklad/UkladTelefon.tsx`:

```tsx
import type { ReactNode } from 'react'
import { EKRANY, TYTULY, etykietaDodania, type Ekran } from './nawigacja'

type Props = {
  ekran: Ekran
  onEkran: (e: Ekran) => void
  jestemRodzicem: boolean
  /** Zawartość górnego paska: sterowanie kalendarza albo nazwa ekranu. */
  gorny: ReactNode
  onDodaj: () => void
  children: ReactNode
}

/** Rama na telefonie: pasek kontekstowy u góry, zakładki i „+" pod kciukiem. */
export function UkladTelefon({
  ekran,
  onEkran,
  jestemRodzicem,
  gorny,
  onDodaj,
  children,
}: Props) {
  const dodawanie = etykietaDodania(ekran, jestemRodzicem)

  return (
    <div className="kokpit kokpit-telefon">
      <header className="pasek-gorny">{gorny}</header>

      <main className="tresc-telefonu">{children}</main>

      {/* Przycisku nie ma wcale tam, gdzie nie wolno dodawać - lepiej niż
          błąd po kliknięciu. Decyduje o tym `etykietaDodania`. */}
      {dodawanie && (
        <button type="button" className="dodaj" onClick={onDodaj} aria-label={dodawanie}>
          +
        </button>
      )}

      <nav className="pasek-dolny" aria-label="Główna">
        {EKRANY.map((e) => (
          <button
            key={e}
            type="button"
            className={`zakladka-dolna${ekran === e ? ' aktywna' : ''}`}
            aria-current={ekran === e ? 'page' : undefined}
            onClick={() => onEkran(e)}
          >
            {TYTULY[e]}
          </button>
        ))}
      </nav>
    </div>
  )
}
```

- [ ] **Krok 5: Przełącz App.tsx na powłoki**

W `src/App.tsx`:

1. Dodaj importy:

```ts
import { useTelefon } from './uklad/useTelefon'
import { UkladBiurko } from './uklad/UkladBiurko'
import { UkladTelefon } from './uklad/UkladTelefon'
import { KontoKarta } from './uklad/KontoKarta'
```

2. Pod `const osoby = useDomownicy(setBlad)` dodaj:

```ts
const telefon = useTelefon()
```

3. Wydziel treść ekranów do zmiennej przed `return` — dokładnie ten sam JSX,
   który dziś jest w `return` po nagłówku (błąd, przełączanie ekranów, układ
   kalendarza):

```tsx
const tresc = (
  <>
    {blad && (
      <p className="blad" role="alert">
        {blad}
      </p>
    )}

    {ekran === 'dom' && telefon && <KontoKarta profil={profil} email={email} />}

    {/* ...dotychczasowa drabinka `ekran === 'zakupy' ? ... : ...` bez zmian */}
  </>
)
```

4. Zamień `return (...)` na wybór powłoki:

```tsx
if (telefon) {
  return (
    <UkladTelefon
      ekran={ekran}
      onEkran={setEkran}
      jestemRodzicem={jestemRodzicem}
      gorny={
        ekran === 'kalendarz' ? (
          <SterowanieKalendarza
            naglowek={naglowek}
            widok={widok}
            onWidok={setWidok}
            onPrzesun={przesun}
            onDzis={() => setKotwica(new Date())}
          />
        ) : (
          <h1 className="tytul-ekranu">{TYTULY[ekran]}</h1>
        )
      }
      onDodaj={() => setDodawanie(ekran)}
    >
      {tresc}
    </UkladTelefon>
  )
}

return (
  <UkladBiurko
    profil={profil}
    email={email}
    ekran={ekran}
    onEkran={setEkran}
  >
    {tresc}
  </UkladBiurko>
)
```

5. Na telefonie sterowanie kalendarza jest w górnym pasku, więc nie może się
   powtórzyć nad siatką. W bloku `<section className="kalendarz">` owiń
   `<SterowanieKalendarza … />` warunkiem `{!telefon && (…)}`.

6. Dodaj stan, którego używa `onDodaj` — na razie tylko go zapisujemy,
   użyjemy w zadaniu 5:

```ts
const [dodawanie, setDodawanie] = useState<Ekran | null>(null)
```

Dopisz też `import { TYTULY } from './uklad/nawigacja'` do istniejącego importu
typu `Ekran`.

- [ ] **Krok 6: Style powłoki telefonu**

Na końcu `src/style/powloka.css`:

```css
/* ===== Układ telefonu ===== */

.kokpit-telefon {
  display: flex;
  flex-direction: column;
  /* dvh zamiast vh - pasek adresu Safari zmienia vh w trakcie przewijania */
  min-height: 100dvh;
  padding: 0;
}

.pasek-gorny {
  position: sticky;
  top: 0;
  z-index: var(--warstwa-pasek);
  padding: calc(var(--odstep-2) + env(safe-area-inset-top)) var(--odstep-4)
    var(--odstep-2);
  background: var(--tlo);
  border-bottom: 1px solid var(--kreska);
}

.tytul-ekranu {
  margin: 0;
  font-size: 20px;
  line-height: var(--dotyk);
}

.tresc-telefonu {
  flex: 1;
  /* Miejsce na dolny pasek i przycisk „+", żeby nie zasłaniały treści. */
  padding: var(--odstep-4) var(--odstep-4)
    calc(var(--pasek) + var(--odstep-5) * 2 + env(safe-area-inset-bottom));
}

.dodaj {
  position: fixed;
  right: var(--odstep-4);
  bottom: calc(var(--pasek) + var(--odstep-4) + env(safe-area-inset-bottom));
  z-index: var(--warstwa-pasek);
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 999px;
  background: var(--akcent);
  color: #fff;
  font-size: 28px;
  line-height: 1;
  box-shadow: var(--cien);
  cursor: pointer;
}

.pasek-dolny {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--warstwa-pasek);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--karta);
  border-top: 1px solid var(--kreska);
}

.zakladka-dolna {
  min-height: var(--pasek);
  border: 0;
  background: none;
  color: var(--tekst-drugi);
  font-size: 12px;
  cursor: pointer;
}

.zakladka-dolna.aktywna {
  color: var(--akcent);
  font-weight: 600;
  box-shadow: inset 0 2px 0 var(--akcent);
}
```

- [ ] **Krok 7: Sprawdź oba układy**

```bash
npm run dev
```

- Szerokość ≥ 1000 px: nagłówek, zakładki u góry, konto po prawej — jak przed
  zmianą. Sterowanie kalendarza nad siatką.
- Szerokość 390 px: górny pasek ze sterowaniem kalendarza, cztery zakładki na
  dole, okrągły „+" nad nimi. Na „Mój dom" u góry karta z imieniem i „Wyloguj".
- Jako **nie-rodzic** na ekranie „Mój dom" przycisku „+" nie ma. (Sprawdź,
  zmieniając sobie chwilowo `role` w bazie albo podmieniając `jestemRodzicem`
  na `false` i cofając zmianę.)
- Przełączanie zakładek na dole działa i podświetla aktywną.

- [ ] **Krok 8: Lint, testy, build, commit**

```bash
npm run lint && npm test && npm run build
git add src
git commit -m "Dwie powloki: zakladki u gory na biurku, pasek dolny na telefonie"
```

---

### Zadanie 5: Formularze w arkuszu

**Pliki:**
- Modyfikacja: `src/App.tsx`
- Modyfikacja: `src/Zakupy.tsx`
- Modyfikacja: `src/Tablica.tsx`
- Modyfikacja: `src/MojDom.tsx`

**Interfejsy:**
- Konsumuje: `TrybDodawania` (zadanie 2), `Arkusz` (zadanie 3), stan
  `dodawanie` (zadanie 4).
- Produkuje: prop `dodawanie: TrybDodawania` w `Zakupy`, `Tablica` i `MojDom`.

Zasada wspólna dla wszystkich trzech ekranów: **formularz renderuje się raz**.
Przy `dodawanie === null` jest wbudowany w stronę, tak jak dziś; przy obiekcie —
wewnątrz `<Arkusz>`. Dwie kopie naraz dawałyby dwa pola o tym samym `id`, czyli
zepsute etykiety dla czytników ekranu.

**Importy do dopisania** (bez nich żaden z poniższych kroków się nie skompiluje):

- `src/App.tsx`: `import { Arkusz } from './uklad/Arkusz'` oraz `TrybDodawania`
  dołożone do istniejącego `import type { Ekran } from './uklad/nawigacja'`
- `src/Zakupy.tsx`, `src/Tablica.tsx`, `src/MojDom.tsx`:
  `import { Arkusz } from './uklad/Arkusz'` i
  `import type { TrybDodawania } from './uklad/nawigacja'`

- [ ] **Krok 1: Przekaż tryb z App.tsx**

W `src/App.tsx` zbuduj tryb raz i podaj go ekranom:

```tsx
const trybDodawania = (dla: Ekran): TrybDodawania =>
  telefon ? { otwarte: dodawanie === dla, onZamknij: () => setDodawanie(null) } : null
```

i przekaż: `<Zakupy … dodawanie={trybDodawania('zakupy')} />`,
`<Tablica … dodawanie={trybDodawania('tablica')} />`,
`<MojDom … dodawanie={trybDodawania('dom')} />`.

Dopisz `TrybDodawania` do importu z `./uklad/nawigacja`.

- [ ] **Krok 2: Kalendarz — formularz wydarzenia do arkusza**

W `src/App.tsx` panel boczny (`<aside className="panel">`) zawiera dziś
`ListaDnia` i `FormularzWydarzenia`. Na telefonie lista ma zostać pod siatką,
a formularz przenieść się do arkusza. Zamień zawartość `aside` na:

```tsx
<aside className="panel" aria-label="Szczegóły dnia">
  {widok === 'miesiac' && !edytowane && (
    <ListaDnia
      dzien={kotwica}
      wydarzenia={widoczne}
      osobaPoId={osobaPoId}
      onKlik={setEdytowane}
    />
  )}

  {telefon ? (
    <Arkusz
      otwarty={dodawanie === 'kalendarz' || edytowane !== null}
      tytul={edytowane ? 'Wydarzenie' : 'Nowe wydarzenie'}
      onZamknij={() => {
        setDodawanie(null)
        setEdytowane(null)
      }}
    >
      {formularzWydarzenia}
    </Arkusz>
  ) : (
    formularzWydarzenia
  )}
</aside>
```

gdzie `formularzWydarzenia` to zmienna zdefiniowana nad `return` z dokładnie
tym `<FormularzWydarzenia … />`, który jest tam dziś (linie 345-363), bez zmian
w propsach.

Stuknięcie wydarzenia w siatce ustawia `edytowane`, więc na telefonie samo
otwiera arkusz — bez tego warunku edycja byłaby niedostępna.

- [ ] **Krok 3: Zakupy**

W `src/Zakupy.tsx` dodaj do `Props`:

```ts
  dodawanie: TrybDodawania
```

Formularz pozycji jest już osobnym komponentem (`FormularzPozycji`, linia 210).
Znajdź miejsce, gdzie jest renderowany, i zamień na:

```tsx
{dodawanie === null ? (
  <FormularzPozycji listaId={wybranaLista.id} onDodaj={dane.dodajPozycje} />
) : (
  <Arkusz
    otwarty={dodawanie.otwarte}
    tytul={`Dodaj do listy: ${wybranaLista.nazwa}`}
    onZamknij={dodawanie.onZamknij}
  >
    <FormularzPozycji listaId={wybranaLista.id} onDodaj={dane.dodajPozycje} />
  </Arkusz>
)}
```

Nazwa listy w tytule arkusza jest tu istotna: „+" siedzi w ramie, która o liście
nie wie, więc użytkownik musi zobaczyć, do której listy dopisuje.

- [ ] **Krok 4: Tablica**

W `src/Tablica.tsx` dodaj `dodawanie: TrybDodawania` do `Props`. Formularz
notatki jest dziś wpisany w JSX (linie 44-57) — wydziel go do lokalnego
komponentu na końcu pliku:

```tsx
type FormularzNotatkiProps = {
  onDodaj: (tresc: string) => Promise<boolean>
  onDodano?: () => void
}

/** Pole nowej notatki. Osobny komponent, bo raz siedzi w stronie, a raz w arkuszu. */
function FormularzNotatki({ onDodaj, onDodano }: FormularzNotatkiProps) {
  const [tresc, setTresc] = useState('')
  const [zapisywanie, setZapisywanie] = useState(false)
  const pole = useRef<HTMLTextAreaElement>(null)

  async function wyslij(e: React.FormEvent) {
    e.preventDefault()
    const tekst = tresc.trim()
    if (!tekst) return

    setZapisywanie(true)
    const udalo = await onDodaj(tekst)
    setZapisywanie(false)

    if (udalo) {
      setTresc('')
      pole.current?.focus()
      onDodano?.()
    }
  }

  return (
    <form className="karta formularz-notatki" onSubmit={(e) => void wyslij(e)}>
      <label htmlFor="tresc-notatki">Nowa notatka</label>
      <textarea
        id="tresc-notatki"
        ref={pole}
        value={tresc}
        onChange={(e) => setTresc(e.target.value)}
        placeholder="np. W piątek nie ma szkoły"
        maxLength={500}
        rows={3}
      />
      <button type="submit" disabled={zapisywanie || !tresc.trim()}>
        {zapisywanie ? 'Przypinam…' : 'Powieś na tablicy'}
      </button>
    </form>
  )
}
```

Usuń z komponentu `Tablica` stan `tresc`, `zapisywanie`, ref `pole` i funkcję
`dodaj` — przeniosły się do formularza. W miejscu usuniętego `<form>` wstaw:

```tsx
{dodawanie === null ? (
  <FormularzNotatki onDodaj={dane.dodaj} />
) : (
  <Arkusz otwarty={dodawanie.otwarte} tytul="Nowa notatka" onZamknij={dodawanie.onZamknij}>
    <FormularzNotatki onDodaj={dane.dodaj} onDodano={dodawanie.onZamknij} />
  </Arkusz>
)}
```

Arkusz zamyka się po udanym dodaniu — na telefonie zostawianie otwartego
formularza po zapisie zasłaniałoby właśnie dodaną karteczkę.

- [ ] **Krok 5: Mój dom**

W `src/MojDom.tsx` dodaj `dodawanie: TrybDodawania` do `Props`. Sekcja „Dodaj
domownika" renderuje się dziś pod warunkiem `jestemRodzicem`. Zamień ją na:

```tsx
{jestemRodzicem &&
  (dodawanie === null ? (
    <section className="karta">
      <h2 className="panel-tytul">Dodaj domownika</h2>
      <p className="panel-dzien">
        Osoba bez adresu e-mail nie loguje się, ale ma swój kolor i wydarzenia.
        Żeby dać jej dostęp, załóż konto w panelu Supabase i wpisz tu ten sam adres.
      </p>
      {formularzOsoby}
    </section>
  ) : (
    <Arkusz
      otwarty={dodawanie.otwarte}
      tytul="Dodaj domownika"
      onZamknij={dodawanie.onZamknij}
    >
      {formularzOsoby}
    </Arkusz>
  ))}
```

gdzie `formularzOsoby` to zmienna nad `return` z dzisiejszym
`<FormularzOsoby … />` z tej sekcji, uzupełnionym o zamknięcie arkusza po
zapisie:

```tsx
const formularzOsoby = (
  <FormularzOsoby
    key={domownicy.length}
    poczatkowe={{ name: '', color: proponowanyKolor(), role: 'domownik', email: '' }}
    etykietaZapisu="Dodaj domownika"
    onZapisz={async (dane) => {
      const ok = await onDodaj(dane)
      if (ok) dodawanie?.onZamknij()
      return ok
    }}
  />
)
```

- [ ] **Krok 6: Sprawdź na telefonie i na komputerze**

```bash
npm run dev
```

Przy 390 px, na każdym z czterech ekranów:

1. „+" otwiera arkusz z właściwym tytułem.
2. Escape zamyka, stuknięcie w tło zamyka, krzyżyk zamyka.
3. Tab krąży wewnątrz arkusza i nie ucieka na treść pod spodem.
4. Po zamknięciu fokus wraca na przycisk „+".
5. Tło nie przewija się, gdy arkusz jest otwarty.
6. Klawiatura ekranowa nie zasłania pola, w którym się pisze.
7. Po zapisaniu arkusz się zamyka, a nowy wpis widać na liście.
8. Na kalendarzu stuknięcie istniejącego wydarzenia otwiera arkusz z jego danymi.

Przy ≥ 1000 px: formularze są wbudowane w stronę dokładnie tam, gdzie były;
żaden arkusz się nie pojawia.

- [ ] **Krok 7: Lint, testy, build, commit**

```bash
npm run lint && npm test && npm run build
git add src
git commit -m "Formularze na telefonie w arkuszu wysuwanym z dolu"
```

---

### Zadanie 6: Kalendarz na wąskim ekranie

**Pliki:**
- Modyfikacja: `src/widoki/Miesiac.tsx`
- Modyfikacja: `src/App.tsx` (przekazanie liczby pigułek)
- Modyfikacja: `src/style/kalendarz.css`

**Interfejsy:**
- Konsumuje: `useTelefon` (zadanie 3).
- Produkuje: prop `maksPigulek: number` w `Miesiac`.

- [ ] **Krok 1: Liczba pigułek z propsa**

W `src/widoki/Miesiac.tsx` usuń stałą `const PIGULEK_W_DNIU = 3` (linia 10),
dodaj do `Props`:

```ts
  /** Ile pigułek mieści się w komórce, zanim zwiniemy resztę w „+N więcej". */
  maksPigulek: number
```

i zamień oba użycia (linie 83 i 95) na `maksPigulek`.

W `src/App.tsx`, w `<Miesiac … />`, dodaj:

```tsx
maksPigulek={telefon ? 2 : 3}
```

- [ ] **Krok 2: Style kalendarza na telefonie**

Na końcu `src/style/kalendarz.css`:

```css
@media (max-width: 767px) {
  /* Komórka dnia: numer i najwyżej dwie pigułki. Wyżej robi się nieczytelnie. */
  .dzien {
    min-height: 64px;
    padding: var(--odstep-1);
  }

  .pigulka {
    font-size: 11px;
    padding: 1px var(--odstep-1);
  }

  .wiecej {
    font-size: 10px;
  }

  /* Tydzień przewijany w bok zamiast ściskany do siedmiu wąskich kolumn.
     Kolumna godzin i nazwy dni zostają w miejscu, żeby dało się wiedzieć,
     na co się patrzy. */
  .sg-przewijane {
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }

  .sg-kolumna {
    min-width: 88px;
  }

  .sg-etykieta-pasa,
  .sg-godzina {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--karta);
  }

  .sg-naglowek {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--karta);
  }

  /* Filtr osób jako pasek chipów przewijany poziomo - inaczej pięcioro
     domowników łamie się na trzy linie i zjada pół ekranu. */
  .filtry,
  .zakladki.widoki {
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  .filtry::-webkit-scrollbar,
  .zakladki.widoki::-webkit-scrollbar {
    display: none;
  }

  .filtr {
    flex: 0 0 auto;
    min-height: var(--dotyk);
  }
}

/* Panel z listą dnia schodzi pod siatkę już dziś: blok `@media (max-width: 900px)`
   przełącza `.uklad` na jedną kolumnę, a `.panel` stoi w drzewie za sekcją
   kalendarza. Nic tu nie dokładamy - sprawdź tylko w kroku 3, że tak jest. */
```

- [ ] **Krok 3: Sprawdź**

```bash
npm run dev
```

Przy 390 px:

1. Miesiąc: komórka z trzema wydarzeniami pokazuje dwie pigułki i „+1 więcej".
2. Stuknięcie dnia pokazuje listę tego dnia **pod siatką**.
3. Tydzień: siatka przewija się w bok, kolumna godzin zostaje na miejscu przy
   przewijaniu, nazwy dni zostają na górze przy przewijaniu w pionie.
4. Filtr osób przewija się w bok jednym palcem i nie łamie się na kilka linii.
5. Dzień: bez zmian, mieści się w szerokości.

Przy ≥ 1000 px: miesiąc nadal pokazuje trzy pigułki, tydzień się nie przewija,
panel dnia jest **obok** siatki, nie pod nią.

- [ ] **Krok 4: Lint, testy, build, commit**

```bash
npm run lint && npm test && npm run build
git add src
git commit -m "Kalendarz na waskim ekranie: dwie pigulki, tydzien przewijany w bok"
```

---

### Zadanie 7: Listy i karty na wąskim ekranie

**Pliki:**
- Modyfikacja: `src/style/listy.css`
- Modyfikacja: `src/style/wspolne.css`
- Modyfikacja: `src/style/formularze.css`

- [ ] **Krok 1: Pola dotyku i chipy**

Na końcu `src/style/listy.css`:

```css
@media (max-width: 767px) {
  /* Wybór listy jak filtr osób - pasek chipów, nie łamiący się rząd. */
  .listy-pasek {
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  .listy-pasek::-webkit-scrollbar {
    display: none;
  }

  .listy-pasek .zakladka {
    flex: 0 0 auto;
    min-height: var(--dotyk);
  }

  /* Odhaczanie jedną ręką w sklepie: całe pole pozycji jest celem, nie sam
     glif checkboksa. */
  .pozycje li {
    min-height: var(--dotyk);
  }

  .pozycja-tresc {
    min-height: var(--dotyk);
    align-items: center;
  }

  .pozycja-tresc input[type='checkbox'] {
    width: 22px;
    height: 22px;
  }

  /* Jedna kolumna: karteczki i domownicy na pełną szerokość. */
  .karteczki {
    grid-template-columns: 1fr;
  }

  .lista-osob li {
    flex-wrap: wrap;
  }
}
```

- [ ] **Krok 2: Prymitywy**

Na końcu `src/style/wspolne.css`:

```css
@media (max-width: 767px) {
  /* Karty bez marginesu bocznego - odstęp daje już `.tresc-telefonu`. */
  .karta {
    padding: var(--odstep-4);
  }

  /* Każdy przycisk tekstowy musi dać się trafić kciukiem. */
  .drobny,
  .usun {
    min-width: var(--dotyk);
    min-height: var(--dotyk);
  }

  .konto-karta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--odstep-3);
  }
}
```

- [ ] **Krok 3: Formularze**

Na końcu `src/style/formularze.css`:

```css
@media (max-width: 767px) {
  /* iOS przybliża stronę przy fokusie na polu mniejszym niż 16px. */
  .formularz input,
  .formularz select,
  .formularz textarea,
  .formularz-listy input,
  .formularz-pozycji input,
  .formularz-notatki textarea {
    font-size: 16px;
    min-height: var(--dotyk);
  }

  .formularz button,
  .formularz-listy button,
  .formularz-pozycji button,
  .formularz-notatki button {
    min-height: var(--dotyk);
  }

  /* Para pól (od - do) jedno pod drugim; obok siebie każde ma po 40 px. */
  .para-pol {
    grid-template-columns: 1fr;
  }

  .kolor {
    width: var(--dotyk);
    height: var(--dotyk);
  }
}
```

- [ ] **Krok 4: Sprawdź**

```bash
npm run dev
```

Przy 390 px:

1. Zakupy: pasek list przewija się w bok; odhaczenie pozycji udaje się kciukiem
   za pierwszym razem.
2. Tablica: karteczki jedna pod drugą, na pełną szerokość.
3. Mój dom: karta konta u góry, lista domowników czytelna, przyciski „Zmień"
   i „×" trafialne.
4. Formularz wydarzenia w arkuszu: stuknięcie w pole **nie przybliża** strony
   (to sprawdź na prawdziwym iPhonie, emulacja tego nie pokaże).

Przy ≥ 1000 px: wszystkie cztery ekrany bez zmian.

- [ ] **Krok 5: Lint, testy, build, commit**

```bash
npm run lint && npm test && npm run build
git add src/style
git commit -m "Listy, karty i formularze na waskim ekranie"
```

---

### Zadanie 8: Próba na prawdziwym telefonie i README

**Pliki:**
- Modyfikacja: `README.md`

- [ ] **Krok 1: Wystaw aplikację w sieci lokalnej**

```bash
npm run dev -- --host
```

Vite wypisze adres w rodzaju `http://192.168.1.14:5173`. Otwórz go na telefonie
podłączonym do tej samej sieci.

- [ ] **Krok 2: Przejdź ścieżki, które robi się z telefonu**

1. Dopisz pozycję do listy zakupów jedną ręką, stojąc — od otwarcia aplikacji
   do zapisania.
2. Odhacz trzy pozycje pod rząd.
3. Dodaj notatkę na tablicę.
4. Dodaj wydarzenie na jutro i przypisz do niego dwie osoby.
5. Otwórz istniejące wydarzenie i zmień godzinę.
6. Przewiń tydzień w bok i wróć.

Przy każdej: czy coś jest poza zasięgiem kciuka, czy klawiatura czegoś nie
zasłania, czy dolny pasek nie wchodzi pod pasek gestów.

Potem to samo w narzędziach przeglądarki na trzech szerokościach: **360 px**
(najwęższy sprzęt w użyciu), **390 px** (iPhone) i **430 px** (duży iPhone).
360 jest tu najważniejsze — jeśli coś się łamie, to tam.

- [ ] **Krok 3: Sprawdź obrót ekranu**

Obróć telefon do poziomu na każdym z czterech ekranów. Przy 390 × 844 obrót daje
844 px szerokości, czyli **układ biurkowy** — to jest zamierzone. Sprawdź, że
przejście w obie strony nie zostawia pustego paska ani nie gubi stanu ekranu.

- [ ] **Krok 4: Opisz to w README**

W `README.md`, po sekcji „Struktura", dodaj:

```markdown
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
```

W tabeli „Struktura" dopisz przed wierszem `src/kolory.ts`:

| Plik | Do czego służy |
| --- | --- |
| `src/uklad/nawigacja.ts` | Ekrany, tytuły i to, co dodaje przycisk „+" |
| `src/uklad/useTelefon.ts` | Czy ekran jest wąski |
| `src/uklad/UkladTelefon.tsx` | Rama telefonu: górny pasek, dolne zakładki, „+" |
| `src/uklad/UkladBiurko.tsx` | Rama komputera: nagłówek i zakładki u góry |
| `src/uklad/Arkusz.tsx` | Formularz wysuwany z dołu |
| `src/uklad/KontoKarta.tsx` | Konto i wylogowanie na ekranie „Mój dom" |
| `src/style/` | Style rozbite na tokeny, wspólne, powłokę, kalendarz, listy i formularze |

W wierszu opisującym `src/App.css` zamień ścieżkę na `src/style/index.css`
i opis na „Spina sześć plików stylów".

- [ ] **Krok 5: Commit**

```bash
git add README.md
git commit -m "README: uklad na telefonie"
```

---

## Kolejność i zależności

```
1 (podzial CSS) ─> 3 (useTelefon + Arkusz) ─┐
2 (nawigacja) ──────────────────────────────┼─> 4 (powloki) ─> 5 (arkusze) ─┐
                                                                             ├─> 8
                                            6 (kalendarz) ─> 7 (listy) ──────┘
```

Zadania 1 i 2 są niezależne od siebie. Zadanie 6 wymaga tylko `useTelefon`
z zadania 3, więc może iść równolegle do 4 i 5 — ale nie w tym samym czasie, bo
oba ruszają `App.tsx`.

Zadanie 8 wymaga prawdziwego telefonu w tej samej sieci Wi-Fi; nie da się go
wykonać w samej przeglądarce na komputerze.
