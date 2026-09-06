# Lista zakupów

Data: 2026-09-06
Dotyczy: Kokpit Rodzinny, funkcja #2 z planu budowy (Faza 2 — rdzeń)

## Po co

Wspólne listy zakupów, na których zmiany widać od razu u wszystkich. Sedno tej
funkcji to sytuacja „ja stoję w sklepie, ty dopisujesz mleko z domu" — bez
podglądu na żywo lista jest zwykłym notatnikiem.

## Decyzje

| Kwestia | Wybór |
| --- | --- |
| Pozycja | nazwa + opcjonalna ilość, osobne pola |
| `quantity` | tekst, nie liczba |
| Na żywo | Supabase Realtime, nie odpytywanie co jakiś czas |
| Odhaczanie | zapis optymistyczny |
| Domyślne listy | Spożywcze, Apteka, Dom — zakładane przy pierwszym wejściu |
| Listy | zakłada i usuwa rodzic |
| Pozycje | dodaje i odhacza każdy z domu; usuwa autor albo rodzic |

`quantity` jako tekst, bo „2 l", „10 szt." i „pół kg" nie mieszczą się w liczbie,
a nikt tego nie sumuje.

## Model danych

```sql
create table shopping_lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now()
);

create table shopping_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references shopping_lists(id) on delete cascade,
  name       text not null,
  quantity   text,
  done       boolean not null default false,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);
```

Usunięcie listy kasuje jej pozycje — inaczej niż przy domownikach, bo pozycja
bez listy nie ma sensu, a wydarzenie bez osoby ma.

## Reguły dostępu

Pozycje należą do domu przez swoją listę, więc polityka musi sięgnąć o jeden
poziom wyżej. Robi to funkcja `SECURITY DEFINER` — ten sam wzorzec, który
rozwiązał rekurencję przy `members` i `event_members`.

```sql
lista_z_mojego_domu(p_lista uuid) returns boolean
```

| Tabela | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| `shopping_lists` | mój dom | rodzic | rodzic | rodzic |
| `shopping_items` | mój dom | każdy z domu | każdy z domu | autor lub rodzic |

Odhaczanie to `update`, więc wolno je każdemu — o to chodzi we wspólnej liście.

## Domyślne listy

Funkcja `zapewnij_listy_zakupow()` (`SECURITY DEFINER`) zakłada Spożywcze,
Apteka i Dom, jeśli gospodarstwo nie ma jeszcze żadnej listy. Wołana przy
wejściu na ekran Zakupy, idempotentna.

`SECURITY DEFINER` jest konieczne, bo wstawianie list wymaga roli rodzica —
a pierwsze wejście na ekran może wykonać dziecko.

## Na żywo

Replikację włącza `alter publication supabase_realtime add table …`, więc
wchodzi migracją; nie trzeba nic klikać w panelu.

Aplikacja otwiera jeden kanał na obie tabele. Po każdej zmianie **przeładowuje
listę w całości**, zamiast doklejać pojedyncze zdarzenia do stanu — przy
kilkudziesięciu pozycjach to tańsze niż utrzymywanie spójności przyrostowo
i odporne na zgubione zdarzenia.

Realtime respektuje RLS, więc kanał nie przyniesie danych z cudzego domu.

Odhaczenie zapisuje się optymistycznie: checkbox reaguje natychmiast, a przy
błędzie wraca do poprzedniego stanu. Bez tego klikanie w sklepie przy słabym
zasięgu byłoby męczące.

## Ekran

Trzecia zakładka obok „Kalendarz" i „Mój dom".

- pasek wyboru listy u góry,
- pozycje: **niekupione na górze, odhaczone na dole i przekreślone**,
- formularz (nazwa + ilość) pod listą; po dodaniu kursor wraca do pola nazwy,
  żeby dopisywanie kilku rzeczy z rzędu było szybkie,
- przycisk **„Wyczyść odhaczone"**,
- licznik pozostałych pozycji przy nazwie listy.

## Pliki

| Plik | Rola |
| --- | --- |
| `src/Zakupy.tsx` | nowy — ekran list i pozycji |
| `src/useZakupy.ts` | nowy — dane, Realtime, operacje |
| `src/zakupy.ts` | nowy — sortowanie i grupowanie pozycji |
| `src/zakupy.test.ts` | nowy — testy tej logiki |
| `src/lib/supabase.ts` | typy `ListaDb`, `PozycjaDb` |
| `src/App.tsx` | trzecia zakładka |
| `src/App.css` | style listy |
| `supabase/schema.sql` | tabele, reguły, publikacja |

## Świadomie pomijam

Kto odhaczył pozycję (`done_by`), historię zakupów, kategorie, sortowanie po
alejkach sklepu, współdzielenie list między domami. `done_by` da się dołożyć
jedną kolumną, gdy okaże się, że tego brakuje.

## Weryfikacja

- Testy jednostkowe na sortowaniu i liczeniu pozycji.
- Reguły RLS zapytaniami z perspektywy ról: czy dziecko odhaczy cudzą pozycję
  (powinno), czy usunie listę (nie powinno), czy obcy z innego domu cokolwiek
  zobaczy (nie powinien).
- Test na żywo w **dwóch kartach przeglądarki naraz**: dopisanie w jednej ma
  pojawić się w drugiej bez odświeżania.
