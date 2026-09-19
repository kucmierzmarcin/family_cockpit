# Ważne rocznice (urodziny, imieniny, rocznice)

Data: 2026-09-19
Status: zaakceptowany projekt, przed planem wdrożenia

## Po co

Domownik chce wpisać raz „urodziny Zuzi to 8 maja" i mieć to **co roku** w
kalendarzu, bez ręcznego dopisywania na każdy kolejny rok i bez pilnowania
dat samemu. Dotyczy nie tylko domowników, ale każdego ważnego dla rodziny
terminu - dziadków, chrzestnych, rocznicy ślubu.

## Dlaczego nie zwykłe powtarzające się wydarzenie

Kalendarz ma już mechanizm powtarzania (`seria()` w `czas.ts`), ale jest do
niego zbudowany pod **skończone** serie: wymaga daty końcowej
(`powtarzaj_do`), generuje realne wiersze w `events` i ma twardy limit 400
wystąpień. Urodziny nie mają daty końcowej - trwają, dopóki ktoś ich nie
usunie. Dopisanie opcji „co roku" do tego mechanizmu oznaczałoby albo sztuczną
datę końcową (i przypominanie userowi o jej przedłużaniu), albo generowanie
wierszy na zapas (i pytanie „na ile lat z góry").

Projekt ma już gotowy wzorzec na dokładnie ten problem: **bloki „Szkoła"**
(`blokiSzkolne()` w `vulcan.ts`) nie są wierszami w `events` - to syntetyczne
`Wydarzenie` liczone w locie z osobnych danych (planu lekcji) i wstrzykiwane
do kalendarza tuż przed renderem. Rocznice pójdą tą samą drogą: mała tabela
przechowuje tylko dzień+miesiąc(+opcjonalnie rok), a funkcja czysta liczy
konkretne wystąpienia na żądany rok - bez limitu, bez daty końcowej, bez
generowania niczego z góry.

## Model danych

```sql
create table public.rocznice (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  tytul        text not null,
  typ          text not null,
  dzien        smallint not null,
  miesiac      smallint not null,
  rok          smallint,
  created_by   uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint rocznice_typ_check check (typ in ('urodziny', 'imieniny', 'rocznica', 'inne')),
  constraint rocznice_miesiac_check check (miesiac between 1 and 12),
  constraint rocznice_dzien_check check (
    dzien between 1 and case miesiac
      when 2 then 29
      when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30
      else 31
    end
  ),
  constraint rocznice_rok_check check (rok is null or rok between 1900 and 2100)
);

create index rocznice_household_idx on public.rocznice (household_id);
```

Rok jest opcjonalny - imieniny zwykle nie mają sensownego roku, urodziny i
rocznice zwykle mają. Gdy jest podany, appka liczy z niego wiek/liczbę lat;
gdy go brak, pokazuje samą nazwę i typ.

### RLS

Ten sam model uprawnień co „Ważne terminy" dla odczytu/dodawania, ale
**symetryczny** dla zmiany/usuwania (Terminy mają asymetrię - update wolno
każdemu, bo służy tylko odhaczaniu; tu nie ma odpowiednika „bezpiecznego"
częściowego update'u, więc obie akcje wymagają autora lub rodzica):

```sql
alter table public.rocznice enable row level security;

create policy "Rocznice - odczyt" on public.rocznice
  for select to authenticated
  using (household_id = public.moj_dom());

create policy "Rocznice - dodawanie" on public.rocznice
  for insert to authenticated
  with check (household_id = public.moj_dom() and created_by = public.ja_jako_member());

create policy "Rocznice - zmiana" on public.rocznice
  for update to authenticated
  using (household_id = public.moj_dom() and (created_by = public.ja_jako_member() or public.jestem_rodzicem()))
  with check (household_id = public.moj_dom());

create policy "Rocznice - usuwanie" on public.rocznice
  for delete to authenticated
  using (household_id = public.moj_dom() and (created_by = public.ja_jako_member() or public.jestem_rodzicem()));
```

## Integracja z kalendarzem

Nowa czysta funkcja (miejsce: nowy plik `src/rocznice.ts`, wzorem
`vulcan.ts`/`blokiSzkolne`):

```ts
export function wydarzeniaRocznic(rocznice: RocznicaDb[], teraz: Date = new Date()): Wydarzenie[]
```

Liczy wystąpienia na trzy lata: ubiegły, bieżący, przyszły (`teraz.getFullYear() - 1` do
`+ 1`) - wystarczająco szeroko dla dowolnej rozsądnej nawigacji po kalendarzu
(dzień/tydzień/miesiąc w okolicy „dziś"), bez potrzeby wiązania się z
aktualnie widocznym zakresem kalendarza. Wydarzenia całodniowe, tytuł złożony
z ikony typu i nazwy, z wiekiem w nawiasie gdy `rok` jest podane:

| Typ | Ikona | Przykład tytułu (z rokiem) | Przykład tytułu (bez roku) |
|---|---|---|---|
| urodziny | 🎂 | „🎂 Urodziny — Zuzia (10 lat)" | „🎂 Urodziny — Zuzia" |
| imieniny | 🎉 | „🎉 Imieniny — Zuzia" | (rok bez znaczenia, pomijany) |
| rocznica | 💍 | „💍 Rocznica — Ślub rodziców (15 lat)" | „💍 Rocznica — Ślub rodziców" |
| inne | 📌 | „📌 Babcia — wizyta doroczna" | (jak wyżej) |

Wiek liczony jako `rok_docelowy - rok`, tylko dla typu `urodziny`/`rocznica` -
dla `imieniny`/`inne` rok, nawet jeśli podany, nie wpływa na tytuł (nie ma
znaczenia semantycznego).

**29 lutego:** w latach nieprzestępnych wystąpienie pada 28 lutego (typowa
konwencja kalendarzy - bez tego rocznica z 29 lutego znikałaby na 3 lata z 4).

`Wydarzenie` dostaje nowe opcjonalne pole `rocznicaId?: string` (ten sam wzór
co `blokSzkolny?: boolean`) - kalendarz rozpoznaje po nim, że kliknięcie ma
przenieść do „Mój dom", a nie otwierać formularz edycji prawdziwego
wydarzenia (identyczny mechanizm jak przy blokach „Szkoła").

`App.tsx` dokłada wynik do połączonej listy obok `blokiSzkolne`:
```ts
[...dane.wydarzenia, ...blokiSzkolne(...), ...wydarzeniaRocznic(rocznice)]
```

## UI w „Mój dom"

Nowa karta „Ważne rocznice", w stylu istniejącej karty „Dodaj domownika"
(zwykłe pola w karcie, bez wyskakującego okna):

- **Tabela** istniejących wpisów: Tytuł | Typ | Data (np. „8 maja") | Rok
  (puste, jeśli brak) | przycisk edycji/usunięcia (widoczny tylko dla
  autora lub rodzica, zgodnie z RLS).
- **Formularz dodawania**: Tytuł (tekst), Typ (select), Dzień (number 1-31),
  Miesiąc (select z nazwami), Rok (number, opcjonalny, placeholder „np.
  2015"). Świadomie NIE natywny `<input type="date">` - ten zawsze wymaga
  pełnej daty łącznie z rokiem, a rok tu ma być naprawdę opcjonalny (np.
  imieniny bez znanego roku).
- Walidacja dnia względem miesiąca (np. nie 31 kwietnia) - i we frontendzie,
  i w ograniczeniu bazy (`rocznice_dzien_check`), tak jak przy innych polach
  dat w tym projekcie.

## Testy

Czysta logika w `src/rocznice.test.ts` (wzorem `czas.test.ts`/
`vulcan.test.ts`): wyliczanie dat na trzy lata, przesunięcie 29 lutego na 28
w roku nieprzestępnym, format tytułu z wiekiem i bez, brak wieku dla
imienin/inne nawet z podanym rokiem, sortowanie razem z prawdziwymi
wydarzeniami.

## Decyzje (podsumowanie)

| Decyzja | Wybór | Dlaczego |
|---|---|---|
| Przechowywanie | Dzień+miesiąc(+opcjonalny rok), nie realne wiersze `events` | Powtarzanie bez końca nie pasuje do systemu serii z limitem i datą końcową |
| Wyświetlanie w kalendarzu | Syntetyczne, liczone w locie | Ten sam, sprawdzony wzorzec co bloki „Szkoła" |
| Zakres wyliczania | Rok ubiegły/bieżący/przyszły, zawsze | Prostsze niż wiązanie z widocznym zakresem kalendarza, tanie przy garstce wpisów |
| Pole roku | Opcjonalne, osobne pola dzień/miesiąc/rok | Natywny date-picker wymusiłby zawsze pełną datę |
| Uprawnienia edycji/usuwania | Autor lub rodzic (symetrycznie) | Brak „bezpiecznego" częściowego update'u jak przy odhaczaniu Terminów |
| Miejsce w UI | Karta w „Mój dom", nie osobna zakładka | User wprost o to poprosił; pasek nawigacji ma już limit celów |
| Kliknięcie w kalendarzu | Przenosi do „Mój dom" | Ten sam mechanizm co bloki „Szkoła" - edycja żyje w jednym miejscu |

## Otwarte ryzyka / przyszła praca

- **Poza zakresem tej zmiany:** licznik na Dashboardzie „Dziś", wzmianka w
  porannym mailu/bocie na Telegramie. Naturalne rozszerzenia, ale nie
  proszone teraz - `wydarzeniaRocznic()` jako czysta funkcja ułatwi to
  później bez przebudowy.
- Zakres trzech lat (ubiegły/bieżący/przyszły) nie pokryje kalendarza
  przewijanego 2+ lata w przód/tył - akceptowalne ograniczenie, do
  rozszerzenia gdyby ktoś faktycznie tak nawigował.
