# Dashboard startowy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać nową zakładkę „Dziś" do Kokpitu Rodzinnego — zegar/data, pogoda dla Milanówka, poziomy grafik dnia całej rodziny (wiersz na domownika) i cztery klikalne liczniki (pilne terminy, nowe wiadomości ze szkoły, otwarte tematy na Tablicy, rzeczy do kupienia).

**Architecture:** Nowy ekran `dashboard` w istniejącej liście `Ekran` (`src/uklad/nawigacja.ts`). Nowy komponent `src/Dashboard.tsx` sam ładuje dane przez już istniejące hooki (`useTerminy`, `useTablica`, `useZakupy`, osobne `useWydarzenia` na dziś) — dokładnie tak jak dziś robią to `Zakupy`, `Tablica`, `Terminy`. Dostaje z `App.tsx` tylko to, co tam już jest scentralizowane: `domownicy`, `vulcan.wiadomosci`, `householdId`, `onBlad`, `onEkran`. Dwa nowe elementy logiki: poziomy „schedule view" (`src/widoki/GrafikDnia.tsx`, oparty o istniejący `ukladajKolumny` z `czas.ts` obrócony o 90°) i pogoda z Open-Meteo bez klucza API (`src/usePogoda.ts`).

**Tech Stack:** React 19 + TypeScript, Vite, Vitest, Supabase JS client. Zero nowych zależności — fetch do Open-Meteo idzie przez wbudowane `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-14-dashboard-startowy-design.md`

## Global Constraints

- Współrzędne pogody na sztywno: Milanówek, 52.1325°N, 20.6539°E.
- Pogoda przez Open-Meteo, bez klucza API, fetch wprost z przeglądarki — żadnej nowej Supabase Edge Function ani sekretu.
- Dashboard jest wyłącznie do odczytu poza czterema klikalnymi licznikami, które przełączają zakładkę (`onEkran`) — brak formularza dodawania, `etykietaDodania('dashboard', …)` zwraca `null`.
- Imieniny i podgląd kamer Hikvision są poza zakresem tego planu (patrz spec, sekcja „Poza zakresem").
- Testy tylko dla czystej logiki (funkcje bez Reacta) — komponenty JSX zostają bez testów jednostkowych, zgodnie z konwencją całego repo (`SiatkaGodzin.tsx`, `Tablica.tsx` itd. też ich nie mają).
- Kod, komentarze i identyfikatory po polsku, zgodnie z resztą repo.

---

## Task 1: Ekran „dashboard" w nawigacji

**Files:**
- Modify: `src/uklad/nawigacja.ts`
- Modify: `src/uklad/nawigacja.test.ts`

**Interfaces:**
- Produces: `'dashboard'` jako nowy wariant typu `Ekran`, pierwszy element `EKRANY`, `TYTULY.dashboard`, `etykietaDodania('dashboard', jestemRodzicem) === null`. Używane przez `App.tsx` (Task 7) i przez `UkladBiurko`/`UkladTelefon` (bez zmian, iterują `EKRANY` generycznie).

- [ ] **Step 1: Write the failing test**

Zastąp całą zawartość `src/uklad/nawigacja.test.ts` (poniższy blok to kompletny plik, nie fragment):

```ts
import { describe, expect, it } from 'vitest'
import { EKRANY, TYTULY, etykietaDodania } from './nawigacja'

describe('EKRANY', () => {
  it('siedem ekranów w kolejności zakładek, dashboard pierwszy', () => {
    expect(EKRANY).toEqual([
      'dashboard',
      'kalendarz',
      'zakupy',
      'tablica',
      'terminy',
      'szkola',
      'dom',
    ])
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
    expect(etykietaDodania('terminy', false)).toBe('Dodaj termin')
  })

  it('domownika dodaje tylko rodzic', () => {
    expect(etykietaDodania('dom', true)).toBe('Dodaj domownika')
    expect(etykietaDodania('dom', false)).toBeNull()
  })

  it('ekran „Szkoła" jest wyłącznie do odczytu', () => {
    expect(etykietaDodania('szkola', true)).toBeNull()
    expect(etykietaDodania('szkola', false)).toBeNull()
  })

  it('ekran „Dziś" jest wyłącznie do odczytu', () => {
    expect(etykietaDodania('dashboard', true)).toBeNull()
    expect(etykietaDodania('dashboard', false)).toBeNull()
  })

  it('rola nie zmienia nic poza ekranem „Mój dom"', () => {
    for (const e of EKRANY.filter((e) => e !== 'dom')) {
      expect(etykietaDodania(e, true)).toBe(etykietaDodania(e, false))
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- nawigacja.test.ts`
Expected: FAIL — `EKRANY` nie zawiera jeszcze `'dashboard'`, `etykietaDodania('dashboard', …)` nie kompiluje się (typ `Ekran` nie ma jeszcze tego wariantu).

- [ ] **Step 3: Write minimal implementation**

W `src/uklad/nawigacja.ts`:

```ts
export type Ekran = 'dashboard' | 'kalendarz' | 'zakupy' | 'tablica' | 'terminy' | 'szkola' | 'dom'

/** Kolejność zakładek - ta sama u góry na biurku i na dole na telefonie. */
export const EKRANY: Ekran[] = ['dashboard', 'kalendarz', 'zakupy', 'tablica', 'terminy', 'szkola', 'dom']

export const TYTULY: Record<Ekran, string> = {
  dashboard: 'Dziś',
  kalendarz: 'Kalendarz',
  zakupy: 'Zakupy',
  tablica: 'Tablica',
  terminy: 'Terminy',
  szkola: 'Szkoła',
  dom: 'Mój dom',
}
```

W funkcji `etykietaDodania`, dodaj gałąź do `switch`:

```ts
export function etykietaDodania(ekran: Ekran, jestemRodzicem: boolean): string | null {
  switch (ekran) {
    case 'dashboard':
      return null
    case 'kalendarz':
      return 'Dodaj wydarzenie'
    case 'zakupy':
      return 'Dodaj pozycję'
    case 'tablica':
      return 'Dodaj notatkę'
    case 'terminy':
      return 'Dodaj termin'
    case 'szkola':
      return null
    case 'dom':
      return jestemRodzicem ? 'Dodaj domownika' : null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- nawigacja.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/uklad/nawigacja.ts src/uklad/nawigacja.test.ts
git commit -m "Dodaj ekran 'dashboard' do nawigacji"
```

---

## Task 2: Liczniki dashboardu — czyste funkcje

**Files:**
- Create: `src/dashboardLiczniki.ts`
- Create: `src/dashboardLiczniki.test.ts`

**Interfaces:**
- Consumes: `Termin`, `czyPrzeterminowany` z `./terminy`; `Wiadomosc` z `./vulcan`.
- Produces: `liczPilneTerminy(terminy: Termin[], dzisiaj: string): number`, `liczWiadomosciDzis(wiadomosci: Wiadomosc[], dzisiaj: string): number` — obie przyjmują `dzisiaj` jako `'RRRR-MM-DD'`. Używane przez `Dashboard.tsx` (Task 6).

- [ ] **Step 1: Write the failing test**

Utwórz `src/dashboardLiczniki.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { liczPilneTerminy, liczWiadomosciDzis } from './dashboardLiczniki'
import type { Termin } from './terminy'
import type { Wiadomosc } from './vulcan'

function termin(zmiany: Partial<Termin>): Termin {
  return {
    id: 'id',
    tytul: 'Test',
    opis: null,
    termin: '2026-09-20',
    zalatwiony: false,
    powiadom: null,
    autorId: null,
    dodano: '2026-09-01T00:00:00Z',
    zalaczniki: [],
    ...zmiany,
  }
}

function wiadomosc(zmiany: Partial<Wiadomosc>): Wiadomosc {
  return {
    id: 'id',
    uczenId: 'uczen-1',
    nadawca: 'Wychowawca',
    temat: 'Temat',
    tresc: 'Treść',
    data: '2026-09-14T08:00:00Z',
    ...zmiany,
  }
}

describe('liczPilneTerminy', () => {
  const dzisiaj = '2026-09-14'

  it('liczy termin z minioną datą powiadomienia', () => {
    expect(liczPilneTerminy([termin({ powiadom: '2026-09-13' })], dzisiaj)).toBe(1)
  })

  it('nie liczy terminu bez daty powiadomienia', () => {
    expect(liczPilneTerminy([termin({ powiadom: null })], dzisiaj)).toBe(0)
  })

  it('nie liczy terminu z powiadomieniem dopiero jutro', () => {
    expect(liczPilneTerminy([termin({ powiadom: '2026-09-15' })], dzisiaj)).toBe(0)
  })

  it('nie liczy terminu z powiadomieniem dziś - jeszcze nie minęło', () => {
    expect(liczPilneTerminy([termin({ powiadom: '2026-09-14' })], dzisiaj)).toBe(0)
  })

  it('nie liczy załatwionego terminu, nawet z minionym powiadomieniem', () => {
    expect(
      liczPilneTerminy([termin({ powiadom: '2026-09-01', zalatwiony: true })], dzisiaj),
    ).toBe(0)
  })

  it('liczy kilka pilnych naraz', () => {
    const terminy = [
      termin({ powiadom: '2026-09-01' }),
      termin({ powiadom: '2026-09-10' }),
      termin({ powiadom: null }),
    ]
    expect(liczPilneTerminy(terminy, dzisiaj)).toBe(2)
  })
})

describe('liczWiadomosciDzis', () => {
  const dzisiaj = '2026-09-14'

  it('liczy wiadomość z dzisiejszą datą', () => {
    expect(liczWiadomosciDzis([wiadomosc({ data: '2026-09-14T07:30:00Z' })], dzisiaj)).toBe(1)
  })

  it('nie liczy wiadomości sprzed wczoraj', () => {
    expect(liczWiadomosciDzis([wiadomosc({ data: '2026-09-13T22:00:00Z' })], dzisiaj)).toBe(0)
  })

  it('liczy przez wszystkich uczniów łącznie', () => {
    const wiadomosci = [
      wiadomosc({ uczenId: 'a', data: '2026-09-14T07:00:00Z' }),
      wiadomosc({ uczenId: 'b', data: '2026-09-14T09:00:00Z' }),
    ]
    expect(liczWiadomosciDzis(wiadomosci, dzisiaj)).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- dashboardLiczniki.test.ts`
Expected: FAIL — moduł `./dashboardLiczniki` jeszcze nie istnieje.

- [ ] **Step 3: Write minimal implementation**

Utwórz `src/dashboardLiczniki.ts`:

```ts
import { klucz } from './dates'
import { czyPrzeterminowany, type Termin } from './terminy'
import type { Wiadomosc } from './vulcan'

/** Ile terminów ma już minioną datę powiadomienia i wciąż czeka na załatwienie. */
export function liczPilneTerminy(terminy: Termin[], dzisiaj: string): number {
  return terminy.filter(
    (t) => !t.zalatwiony && t.powiadom !== null && czyPrzeterminowany(t.powiadom, dzisiaj),
  ).length
}

/** Ile wiadomości ze szkoły przyszło dzisiaj, licząc przez wszystkich uczniów łącznie. */
export function liczWiadomosciDzis(wiadomosci: Wiadomosc[], dzisiaj: string): number {
  return wiadomosci.filter((w) => klucz(new Date(w.data)) === dzisiaj).length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- dashboardLiczniki.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dashboardLiczniki.ts src/dashboardLiczniki.test.ts
git commit -m "Dodaj liczniki dashboardu: pilne terminy i wiadomości z dziś"
```

---

## Task 3: Zakres godzin dla grafiku dnia — czysta funkcja

**Files:**
- Create: `src/widoki/grafikDnia.ts`
- Create: `src/widoki/grafikDnia.test.ts`

**Interfaces:**
- Consumes: `minutyOdPolnocy`, `type Przedzial` z `../czas`.
- Produces: `zakresGodzin(wydarzenia: Przedzial[]): { godzinaOd: number; godzinaDo: number }` — domyślnie `6..23`, rozszerzane gdy wydarzenie wykracza poza to okno. Używane przez `GrafikDnia.tsx` (Task 4).

- [ ] **Step 1: Write the failing test**

Utwórz `src/widoki/grafikDnia.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { zakresGodzin } from './grafikDnia'

function d(tekst: string): Date {
  return new Date(tekst)
}

describe('zakresGodzin', () => {
  it('bez wydarzeń zwraca domyślne okno 6-23', () => {
    expect(zakresGodzin([])).toEqual({ godzinaOd: 6, godzinaDo: 23 })
  })

  it('wydarzenie w obrębie domyślnego okna nie zmienia zakresu', () => {
    const wydarzenia = [{ start: d('2026-09-14T10:00'), koniec: d('2026-09-14T11:00') }]
    expect(zakresGodzin(wydarzenia)).toEqual({ godzinaOd: 6, godzinaDo: 23 })
  })

  it('wczesne wydarzenie rozszerza dolną granicę', () => {
    const wydarzenia = [{ start: d('2026-09-14T05:15'), koniec: d('2026-09-14T05:45') }]
    expect(zakresGodzin(wydarzenia)).toEqual({ godzinaOd: 5, godzinaDo: 23 })
  })

  it('późne wydarzenie rozszerza górną granicę, zaokrąglając w górę', () => {
    const wydarzenia = [{ start: d('2026-09-14T23:30'), koniec: d('2026-09-14T23:50') }]
    expect(zakresGodzin(wydarzenia)).toEqual({ godzinaOd: 6, godzinaDo: 24 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- widoki/grafikDnia.test.ts`
Expected: FAIL — moduł `./grafikDnia` jeszcze nie istnieje.

- [ ] **Step 3: Write minimal implementation**

Utwórz `src/widoki/grafikDnia.ts`:

```ts
import { minutyOdPolnocy, type Przedzial } from '../czas'

const DOMYSLNA_GODZINA_OD = 6
const DOMYSLNA_GODZINA_DO = 23
const MINUT_W_DOBIE = 24 * 60

/**
 * Okno godzin do pokazania w poziomym grafiku dnia: domyślnie 6-23,
 * rozszerzane, gdy któreś wydarzenie wykracza poza ten zakres - tak jak
 * `wypelnijOkno` w `SiatkaGodzin.tsx`, tylko jako samodzielna, testowalna
 * funkcja (grafik dnia ma inny układ osi niż siatka godzin).
 */
export function zakresGodzin(wydarzenia: Przedzial[]): { godzinaOd: number; godzinaDo: number } {
  let godzinaOd = DOMYSLNA_GODZINA_OD
  let godzinaDo = DOMYSLNA_GODZINA_DO

  for (const w of wydarzenia) {
    const odMinut = minutyOdPolnocy(w.start)
    const doMinut = minutyOdPolnocy(w.koniec) || MINUT_W_DOBIE
    godzinaOd = Math.min(godzinaOd, Math.floor(odMinut / 60))
    godzinaDo = Math.max(godzinaDo, Math.ceil(doMinut / 60))
  }

  return { godzinaOd, godzinaDo }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- widoki/grafikDnia.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/widoki/grafikDnia.ts src/widoki/grafikDnia.test.ts
git commit -m "Dodaj obliczanie zakresu godzin dla grafiku dnia"
```

---

## Task 4: Komponent GrafikDnia.tsx — poziomy grafik dnia

**Files:**
- Create: `src/widoki/GrafikDnia.tsx`
- Create: `src/style/dashboard.css`
- Modify: `src/style/index.css:8` (dodać import)

**Interfaces:**
- Consumes: `zakresGodzin` z `./grafikDnia` (Task 3); `ukladajKolumny`, `minutyOdPolnocy`, `wJednymDniu`, `godzinaHM` z `../czas`; `kolor` z `../kolory`; `type DomownikDb` z `../lib/supabase`; `type Wydarzenie` z `../useWydarzenia`.
- Produces: `GrafikDnia` — komponent z propsami `{ domownicy: DomownikDb[]; wydarzenia: Wydarzenie[] }`. Używane przez `Dashboard.tsx` (Task 6). Wydarzenia bez przypisanej osoby (`osobyId.length === 0`) i całodniowe nie pokazują się w tym widoku - grafik jest per-osoba, na jeden rzut oka.

- [ ] **Step 1: Napisz komponent**

Utwórz `src/widoki/GrafikDnia.tsx`:

```tsx
import { useMemo, type CSSProperties } from 'react'
import type { DomownikDb } from '../lib/supabase'
import type { Wydarzenie } from '../useWydarzenia'
import { godzinaHM, minutyOdPolnocy, ukladajKolumny, wJednymDniu } from '../czas'
import { kolor } from '../kolory'
import { zakresGodzin } from './grafikDnia'

const MINUT_W_DOBIE = 24 * 60
const WYSOKOSC_TORU = 28

type Props = {
  domownicy: DomownikDb[]
  wydarzenia: Wydarzenie[]
}

/**
 * Poziomy "schedule view" jak w Outlooku: jeden wiersz na domownika, oś
 * pozioma to godziny. Nakładające się wydarzenia tej samej osoby układa
 * `ukladajKolumny` z czas.ts - ten sam algorytm co w SiatkaGodzin.tsx,
 * tylko obrócony o 90°: kolumny stają się poziomymi torami w obrębie wiersza.
 */
export function GrafikDnia({ domownicy, wydarzenia }: Props) {
  const godzinne = useMemo(
    () => wydarzenia.filter((w) => !w.calodniowe && wJednymDniu(w)),
    [wydarzenia],
  )

  const { godzinaOd, godzinaDo } = useMemo(() => zakresGodzin(godzinne), [godzinne])
  const liczbaGodzin = godzinaDo - godzinaOd
  const zakresOdMinut = godzinaOd * 60
  const zakresMinut = liczbaGodzin * 60

  return (
    <div className="karta grafik-dnia">
      <div className="gd-godziny" style={{ '--godzin': liczbaGodzin } as CSSProperties}>
        {Array.from({ length: liczbaGodzin }, (_, i) => godzinaOd + i).map((g) => (
          <div key={g} className="gd-godzina">
            {String(g).padStart(2, '0')}:00
          </div>
        ))}
      </div>

      <div className="gd-wiersze">
        {domownicy.map((osoba) => {
          const wydarzeniaOsoby = godzinne.filter((w) => w.osobyId.includes(osoba.id))
          const ulozone = ukladajKolumny(wydarzeniaOsoby)
          // Najwyższa liczba nakładających się wydarzeń w CAŁYM wierszu tej
          // osoby - może się różnić między grupami (np. dwa osobne, niena-
          // kładające się spotkania w ciągu dnia), więc bierzemy maksimum,
          // nie kolumn pierwszego elementu.
          const tory = ulozone.reduce((maks, w) => Math.max(maks, w.kolumn), 1)
          const barwa = kolor(osoba.color)

          return (
            <div key={osoba.id} className="gd-wiersz" style={{ minHeight: tory * WYSOKOSC_TORU }}>
              <div className="gd-etykieta">
                <span className="kropka" style={{ background: barwa.kropka }} aria-hidden="true" />
                {osoba.name}
              </div>

              <div className="gd-tor-kontener">
                {ulozone.map((w) => {
                  const odMinut = minutyOdPolnocy(w.start)
                  const doMinut = minutyOdPolnocy(w.koniec) || MINUT_W_DOBIE

                  // Wysokość i pozycja pionowa w stałych pikselach (nie w %
                  // wysokości wiersza) - inaczej pojedyncze wydarzenie w
                  // wierszu, którego wysokość narzuciła INNA, bardziej
                  // nakładająca się grupa czasowa tej samej osoby, rozciąg-
                  // nęłoby się na cały wiersz zamiast zająć jeden tor.
                  return (
                    <div
                      key={w.id}
                      className="gd-blok"
                      title={`${godzinaHM(w.start)}–${godzinaHM(w.koniec)} ${w.tytul}`}
                      style={{
                        left: `${((odMinut - zakresOdMinut) / zakresMinut) * 100}%`,
                        width: `${((doMinut - odMinut) / zakresMinut) * 100}%`,
                        top: w.kolumna * WYSOKOSC_TORU + 2,
                        height: WYSOKOSC_TORU - 4,
                        background: barwa.tlo,
                        color: barwa.tekst,
                        borderLeftColor: barwa.kropka,
                      }}
                    >
                      {w.tytul}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Dodaj style**

Utwórz `src/style/dashboard.css`:

```css
.grafik-dnia {
  overflow-x: auto;
}

.gd-godziny {
  display: grid;
  grid-template-columns: repeat(var(--godzin), 1fr);
  margin-left: 128px;
  margin-bottom: var(--odstep-2);
  min-width: 600px;
}

.gd-godzina {
  font-size: 12px;
  color: var(--tekst-drugi);
  border-left: 1px solid var(--kreska);
  padding-left: 4px;
}

.gd-wiersze {
  display: flex;
  flex-direction: column;
  gap: var(--odstep-2);
  min-width: 600px;
}

.gd-wiersz {
  display: flex;
  align-items: stretch;
}

.gd-etykieta {
  flex: 0 0 128px;
  display: flex;
  align-items: center;
  gap: var(--odstep-1);
  font-size: 14px;
  padding-right: var(--odstep-2);
}

.gd-tor-kontener {
  position: relative;
  flex: 1;
  background: var(--tlo);
  border-radius: var(--promien-s);
}

.gd-blok {
  position: absolute;
  box-sizing: border-box;
  border-radius: var(--promien-s);
  border-left: 3px solid;
  padding: 2px 6px;
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

@media (max-width: 640px) {
  .gd-godziny,
  .gd-wiersze {
    min-width: 480px;
  }
}
```

Dodaj import w `src/style/index.css` (po `kalendarz.css`, obok pozostałych):

```css
@import './kalendarz.css';
@import './listy.css';
@import './dashboard.css';
@import './formularze.css';
```

- [ ] **Step 3: Zweryfikuj typy**

Run: `npm run build`
Expected: kompiluje się bez błędów (nowy plik nie jest jeszcze nigdzie importowany, ale musi się samodzielnie kompilować).

- [ ] **Step 4: Commit**

```bash
git add src/widoki/GrafikDnia.tsx src/style/dashboard.css src/style/index.css
git commit -m "Dodaj komponent poziomego grafiku dnia"
```

---

## Task 5: Pogoda — usePogoda.ts

**Files:**
- Create: `src/usePogoda.ts`
- Create: `src/usePogoda.test.ts`

**Interfaces:**
- Produces: `WSPOLRZEDNE_MILANOWKA` (stała), `zbudujUrlPogody(): string`, `pogodaZOdpowiedzi(dane: OdpowiedzOpenMeteo): Pogoda`, `opisPogody(kod: number): string`, `type Pogoda`, hook `usePogoda(): { pogoda: Pogoda | null; blad: boolean }`. Używane przez `Dashboard.tsx` (Task 6).

- [ ] **Step 1: Write the failing test**

Utwórz `src/usePogoda.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { opisPogody, pogodaZOdpowiedzi, zbudujUrlPogody } from './usePogoda'

describe('zbudujUrlPogody', () => {
  it('woła Open-Meteo ze współrzędnymi Milanówka, bez klucza API', () => {
    const url = zbudujUrlPogody()
    expect(url).toContain('https://api.open-meteo.com/v1/forecast')
    expect(url).toContain('latitude=52.1325')
    expect(url).toContain('longitude=20.6539')
    expect(url).not.toContain('key=')
    expect(url).not.toContain('appid=')
  })
})

describe('pogodaZOdpowiedzi', () => {
  it('mapuje aktualną pogodę i prognozę godzinową', () => {
    const dane = {
      current: { time: '2026-09-14T12:00', temperature_2m: 21.4, weather_code: 3 },
      hourly: {
        time: ['2026-09-14T00:00', '2026-09-14T01:00'],
        temperature_2m: [14.1, 13.8],
        weather_code: [1, 1],
      },
    }
    expect(pogodaZOdpowiedzi(dane)).toEqual({
      teraz: { temperatura: 21.4, kod: 3 },
      dzisiaj: [
        { godzina: '00:00', temperatura: 14.1, kod: 1 },
        { godzina: '01:00', temperatura: 13.8, kod: 1 },
      ],
    })
  })
})

describe('opisPogody', () => {
  it('opisuje znane kody WMO', () => {
    expect(opisPogody(0)).toBe('Bezchmurnie')
    expect(opisPogody(61)).toBe('Deszcz słaby')
    expect(opisPogody(95)).toBe('Burza')
  })

  it('nieznany kod dostaje opis zastępczy', () => {
    expect(opisPogody(999)).toBe('Pogoda nieznana')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- usePogoda.test.ts`
Expected: FAIL — moduł `./usePogoda` jeszcze nie istnieje.

- [ ] **Step 3: Write minimal implementation**

Utwórz `src/usePogoda.ts`:

```ts
import { useEffect, useState } from 'react'

export const SZEROKOSC_MILANOWKA = 52.1325
export const DLUGOSC_MILANOWKA = 20.6539

const ODSWIEZANIE_MS = 30 * 60 * 1000

type OdpowiedzOpenMeteo = {
  current: { time: string; temperature_2m: number; weather_code: number }
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] }
}

export type GodzinaPogody = { godzina: string; temperatura: number; kod: number }

export type Pogoda = {
  teraz: { temperatura: number; kod: number }
  dzisiaj: GodzinaPogody[]
}

/** Adres Open-Meteo dla Milanówka - darmowe API, bez klucza. */
export function zbudujUrlPogody(): string {
  const parametry = new URLSearchParams({
    latitude: String(SZEROKOSC_MILANOWKA),
    longitude: String(DLUGOSC_MILANOWKA),
    current: 'temperature_2m,weather_code',
    hourly: 'temperature_2m,weather_code',
    timezone: 'Europe/Warsaw',
    forecast_days: '1',
  })
  return `https://api.open-meteo.com/v1/forecast?${parametry.toString()}`
}

/** Zamienia odpowiedź Open-Meteo na kształt, z którym pracuje dashboard. */
export function pogodaZOdpowiedzi(dane: OdpowiedzOpenMeteo): Pogoda {
  return {
    teraz: { temperatura: dane.current.temperature_2m, kod: dane.current.weather_code },
    dzisiaj: dane.hourly.time.map((czas, i) => ({
      godzina: czas.slice(11, 16),
      temperatura: dane.hourly.temperature_2m[i],
      kod: dane.hourly.weather_code[i],
    })),
  }
}

/** Opisy kodów pogodowych WMO (tabela 4677), używanych przez Open-Meteo. */
const OPISY_KODOW: Record<number, string> = {
  0: 'Bezchmurnie',
  1: 'Prawie bezchmurnie',
  2: 'Częściowe zachmurzenie',
  3: 'Pochmurno',
  45: 'Mgła',
  48: 'Mgła osadzająca szron',
  51: 'Mżawka słaba',
  53: 'Mżawka umiarkowana',
  55: 'Mżawka gęsta',
  56: 'Marznąca mżawka słaba',
  57: 'Marznąca mżawka gęsta',
  61: 'Deszcz słaby',
  63: 'Deszcz umiarkowany',
  65: 'Deszcz silny',
  66: 'Marznący deszcz słaby',
  67: 'Marznący deszcz silny',
  71: 'Śnieg słaby',
  73: 'Śnieg umiarkowany',
  75: 'Śnieg silny',
  77: 'Ziarna śniegu',
  80: 'Przelotny deszcz słaby',
  81: 'Przelotny deszcz umiarkowany',
  82: 'Przelotny deszcz gwałtowny',
  85: 'Przelotny śnieg słaby',
  86: 'Przelotny śnieg silny',
  95: 'Burza',
  96: 'Burza z gradem słabym',
  99: 'Burza z gradem silnym',
}

export function opisPogody(kod: number): string {
  return OPISY_KODOW[kod] ?? 'Pogoda nieznana'
}

/**
 * Pogoda dla Milanówka, odświeżana co pół godziny. Błąd sieci nie trafia do
 * wspólnego `onBlad` reszty aplikacji - pogoda jest opcjonalną kartą, nie ma
 * blokować dashboardu tak jak dziś nie blokują go Telegram czy Vulcan.
 */
export function usePogoda(): { pogoda: Pogoda | null; blad: boolean } {
  const [pogoda, setPogoda] = useState<Pogoda | null>(null)
  const [blad, setBlad] = useState(false)

  useEffect(() => {
    let aktualne = true

    async function wczytaj() {
      try {
        const odpowiedz = await fetch(zbudujUrlPogody())
        if (!odpowiedz.ok) throw new Error(String(odpowiedz.status))
        const dane = (await odpowiedz.json()) as OdpowiedzOpenMeteo
        if (aktualne) {
          setPogoda(pogodaZOdpowiedzi(dane))
          setBlad(false)
        }
      } catch {
        if (aktualne) setBlad(true)
      }
    }

    void wczytaj()
    const timer = setInterval(() => void wczytaj(), ODSWIEZANIE_MS)

    return () => {
      aktualne = false
      clearInterval(timer)
    }
  }, [])

  return { pogoda, blad }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- usePogoda.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/usePogoda.ts src/usePogoda.test.ts
git commit -m "Dodaj pogode dla Milanowka z Open-Meteo"
```

---

## Task 6: Dashboard.tsx — spina ekran

**Files:**
- Create: `src/Dashboard.tsx`
- Modify: `src/style/dashboard.css`

**Interfaces:**
- Consumes: `useWydarzenia` z `./useWydarzenia`; `useTerminy` z `./useTerminy`; `useTablica` z `./useTablica`; `useZakupy` z `./useZakupy`; `usePogoda`, `opisPogody` z `./usePogoda`; `liczPilneTerminy`, `liczWiadomosciDzis` z `./dashboardLiczniki`; `policzPozostale` z `./pozycje`; `klucz`, `dlugaData` z `./dates`; `godzinaHM`, `poczatekDnia`, `nastepnyDzien` z `./czas`; `GrafikDnia` z `./widoki/GrafikDnia`; `type Ekran` z `./uklad/nawigacja`; `type DomownikDb` z `./lib/supabase`; `type Wiadomosc` z `./vulcan`.
- Produces: `Dashboard` — komponent z propsami `{ householdId: string; domownicy: DomownikDb[]; wiadomosci: Wiadomosc[]; onBlad: (tekst: string) => void; onEkran: (e: Ekran) => void }`. Używane przez `App.tsx` (Task 7).

- [ ] **Step 1: Napisz komponent**

Utwórz `src/Dashboard.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { DomownikDb } from './lib/supabase'
import type { Wiadomosc } from './vulcan'
import type { Ekran } from './uklad/nawigacja'
import { dlugaData, klucz } from './dates'
import { godzinaHM, nastepnyDzien, poczatekDnia } from './czas'
import { useWydarzenia } from './useWydarzenia'
import { useTerminy } from './useTerminy'
import { useTablica } from './useTablica'
import { useZakupy } from './useZakupy'
import { opisPogody, usePogoda } from './usePogoda'
import { liczPilneTerminy, liczWiadomosciDzis } from './dashboardLiczniki'
import { policzPozostale } from './pozycje'
import { GrafikDnia } from './widoki/GrafikDnia'

type Props = {
  householdId: string
  domownicy: DomownikDb[]
  wiadomosci: Wiadomosc[]
  onBlad: (tekst: string) => void
  onEkran: (e: Ekran) => void
}

/** Ekran „Dziś": pogoda, zegar, grafik dnia całej rodziny i cztery liczniki. */
export function Dashboard({ householdId, domownicy, wiadomosci, onBlad, onEkran }: Props) {
  const [teraz, setTeraz] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setTeraz(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const dzisiaj = klucz(teraz)
  // Zakres jako osobne wywołanie useWydarzenia, niezależne od tego, po jakim
  // zakresie nawiguje akurat zakładka „kalendarz" (tamten `dane` w App.tsx
  // pokazuje miesiąc/tydzień/dzień zależnie od stanu `widok`).
  const poczatekDzis = useMemo(() => poczatekDnia(teraz), [dzisiaj])
  const koniecDzis = useMemo(() => nastepnyDzien(teraz), [dzisiaj])

  const dane = useWydarzenia(poczatekDzis, koniecDzis, onBlad)
  const terminy = useTerminy(householdId, onBlad)
  const tablica = useTablica(onBlad)
  const zakupy = useZakupy(onBlad)
  const { pogoda, blad: bladPogody } = usePogoda()

  const liczbaPilnychTerminow = useMemo(
    () => liczPilneTerminy(terminy.terminy, dzisiaj),
    [terminy.terminy, dzisiaj],
  )
  const liczbaWiadomosciDzis = useMemo(
    () => liczWiadomosciDzis(wiadomosci, dzisiaj),
    [wiadomosci, dzisiaj],
  )
  const liczbaOtwartychTematow = tablica.notatki.length
  const liczbaDoKupienia = policzPozostale(zakupy.pozycje)

  const ladowanie = dane.ladowanie || terminy.ladowanie || tablica.ladowanie || zakupy.ladowanie

  if (ladowanie) {
    return <p className="pusto">Wczytuję…</p>
  }

  return (
    <div className="dashboard">
      <div className="dash-karty">
        <div className="karta dash-zegar">
          <p className="dash-godzina">{godzinaHM(teraz)}</p>
          <p className="dash-data">{dlugaData(teraz)}</p>
        </div>

        <div className="karta dash-pogoda">
          {bladPogody ? (
            <p className="pusto">Pogoda niedostępna.</p>
          ) : !pogoda ? (
            <p className="pusto">Wczytuję pogodę…</p>
          ) : (
            <>
              <p className="dash-temperatura">{Math.round(pogoda.teraz.temperatura)}°C</p>
              <p className="dash-opis-pogody">{opisPogody(pogoda.teraz.kod)}</p>
            </>
          )}
        </div>
      </div>

      <GrafikDnia domownicy={domownicy} wydarzenia={dane.wydarzenia} />

      <div className="dash-liczniki">
        <LicznikDnia
          etykieta="Pilne terminy"
          wartosc={liczbaPilnychTerminow}
          pilny={liczbaPilnychTerminow > 0}
          onKlik={() => onEkran('terminy')}
        />
        <LicznikDnia
          etykieta="Nowe wiadomości"
          wartosc={liczbaWiadomosciDzis}
          onKlik={() => onEkran('szkola')}
        />
        <LicznikDnia
          etykieta="Otwarte tematy"
          wartosc={liczbaOtwartychTematow}
          onKlik={() => onEkran('tablica')}
        />
        <LicznikDnia
          etykieta="Do kupienia"
          wartosc={liczbaDoKupienia}
          onKlik={() => onEkran('zakupy')}
        />
      </div>
    </div>
  )
}

type LicznikProps = {
  etykieta: string
  wartosc: number
  pilny?: boolean
  onKlik: () => void
}

function LicznikDnia({ etykieta, wartosc, pilny, onKlik }: LicznikProps) {
  return (
    <button
      type="button"
      className={`karta dash-licznik${pilny ? ' dash-licznik-pilny' : ''}`}
      onClick={onKlik}
    >
      <span className="dash-licznik-wartosc">{wartosc}</span>
      <span className="dash-licznik-etykieta">{etykieta}</span>
    </button>
  )
}
```

- [ ] **Step 2: Dopisz style do `src/style/dashboard.css`**

Dopisz na końcu pliku (nie ruszając sekcji grafiku dnia z Task 4):

```css
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--odstep-4);
}

.dash-karty {
  display: flex;
  flex-wrap: wrap;
  gap: var(--odstep-4);
}

.dash-zegar,
.dash-pogoda {
  flex: 1 1 200px;
  text-align: center;
}

.dash-godzina,
.dash-temperatura {
  margin: 0;
  font-size: 40px;
  font-weight: 600;
}

.dash-data,
.dash-opis-pogody {
  margin: 4px 0 0;
  color: var(--tekst-drugi);
  text-transform: capitalize;
}

.dash-liczniki {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--odstep-4);
}

.dash-licznik {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--odstep-1);
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.dash-licznik-wartosc {
  font-size: 32px;
  font-weight: 600;
}

.dash-licznik-etykieta {
  color: var(--tekst-drugi);
  font-size: 13px;
}

.dash-licznik-pilny {
  background: var(--blad-tlo);
}

.dash-licznik-pilny .dash-licznik-wartosc {
  color: var(--blad);
}

@media (max-width: 640px) {
  .dash-liczniki {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

- [ ] **Step 3: Zweryfikuj typy**

Run: `npm run build`
Expected: kompiluje się bez błędów.

- [ ] **Step 4: Commit**

```bash
git add src/Dashboard.tsx src/style/dashboard.css
git commit -m "Dodaj komponent Dashboard spinajacy ekran Dzis"
```

---

## Task 7: Wpięcie ekranu do App.tsx

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `Dashboard` z `./Dashboard` (Task 6). Podłącza go do istniejącego stanu `ekran`, `osoby.domownicy`, `vulcan.wiadomosci`, `profil.household_id`, `setBlad`, `przelaczEkran` (wszystko już istnieje w `App.tsx`).

- [ ] **Step 1: Dodaj import**

W `src/App.tsx`, obok pozostałych importów komponentów ekranów (koło `import { MojDom } from './MojDom'`):

```ts
import { Dashboard } from './Dashboard'
```

- [ ] **Step 2: Dodaj gałąź ekranu**

W `src/App.tsx`, w bloku `tresc`, dodaj nową gałąź `ekran === 'dashboard'` na samym początku łańcucha (przed `ekran === 'zakupy'`), zgodnie z kolejnością w `EKRANY`:

```tsx
  const tresc = (
    <>
      {blad && (
        <p className="blad" role="alert">
          {blad}
        </p>
      )}

      {ekran === 'dom' && telefon && <KontoKarta profil={profil} email={email} />}

      {ekran === 'dashboard' ? (
        <Dashboard
          householdId={profil.household_id}
          domownicy={osoby.domownicy}
          wiadomosci={vulcan.wiadomosci}
          onBlad={setBlad}
          onEkran={przelaczEkran}
        />
      ) : ekran === 'zakupy' ? (
        <Zakupy
```

(reszta łańcucha `ekran === 'zakupy' ? ... : ekran === 'tablica' ? ...` zostaje bez zmian, tylko całość teraz jest zagnieżdżona pod nowym pierwszym warunkiem).

- [ ] **Step 3: Zweryfikuj całość**

Run: `npm run build`
Expected: kompiluje się bez błędów.

Run: `npm run test`
Expected: wszystkie testy przechodzą (w tym zaktualizowany `nawigacja.test.ts` z Task 1).

Run: `npm run lint`
Expected: brak nowych błędów/ostrzeżeń w zmienionych plikach.

- [ ] **Step 4: Sprawdź ręcznie w przeglądarce**

Run: `npm run dev`

- Otwórz aplikację, zaloguj się.
- Sprawdź, że zakładka „Dziś" jest pierwsza na pasku (biurko: u góry; telefon: na dole).
- Kliknij ją: widać zegar, pogodę dla Milanówka, poziomy grafik dnia z wierszem dla każdego domownika i cztery liczniki.
- Kliknij licznik „Pilne terminy" (lub inny) i sprawdź, że przełącza na odpowiednią zakładkę.
- Zmniejsz okno do szerokości telefonu i sprawdź, że liczniki układają się 2×2, a karty jedna pod drugą.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "Wepnij ekran Dashboard do App.tsx jako pierwsza zakladka"
```
