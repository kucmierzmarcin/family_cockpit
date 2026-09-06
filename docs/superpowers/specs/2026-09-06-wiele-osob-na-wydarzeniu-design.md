# Wiele osób na jednym wydarzeniu

Data: 2026-09-06
Dotyczy: Kokpit Rodzinny, rozszerzenie kalendarza

## Po co

Wydarzenie wskazuje dziś dokładnie jedną osobę (`events.member_id`). Wspólny
obiad, wyjazd całej rodziny czy odbiór dzieci przez oboje rodziców nie mają jak
się zapisać.

## Decyzje

| Kwestia | Wybór |
| --- | --- |
| Relacja | tabela łącząca `event_members` (wiele-do-wielu) |
| Kolor bloku | tło od pierwszej osoby, pozostałe jako kropki |
| „Pierwsza osoba" | wg kolejności domowników w domu, nie kolejności klikania |
| Filtr | wydarzenie widać, gdy widoczna jest **choć jedna** z jego osób |
| Kto dopisuje osoby | autor wydarzenia albo rodzic |

Kolejność domowników zamiast kolejności zaznaczania — dzięki temu ta sama para
osób zawsze daje ten sam kolor, a wydarzenie nie zmienia barwy po ponownym
otwarciu i zapisaniu.

## Model danych

```sql
create table event_members (
  event_id  uuid references events(id)  on delete cascade,
  member_id uuid references members(id) on delete cascade,
  primary key (event_id, member_id)
);
```

`events.member_id` znika po przeniesieniu danych. Usunięcie domownika kasuje
jego przypisania, ale zostawia wydarzenia — tak jak dotąd robiło
`on delete set null`.

## Reguły dostępu

Dzisiejsza polityka usuwania wydarzeń sprawdza `member_id = ja_jako_member()`.
Po zmianie musiałaby pytać `event_members`, którego własna polityka pyta o
`events` — czyli rekurencja, ta sama pułapka, którą obeszliśmy już przy
`members`.

Rozwiązanie jest to samo: funkcja `SECURITY DEFINER`.

```sql
jestem_przypisany(p_event uuid) returns boolean
```

| Tabela | select | insert | delete |
| --- | --- | --- | --- |
| `event_members` | mój dom | autor wydarzenia lub rodzic | autor lub rodzic |

Uprawnienia do samych wydarzeń zostają bez zmian: usuwa i zmienia autor, osoba
przypisana albo rodzic — z tym że „przypisany" liczy się teraz przez
`jestem_przypisany()`.

Ograniczenie dopisywania do autora i rodzica jest celowe: bez niego dziecko
mogłoby dopisać się do dowolnego cudzego wpisu.

## Aplikacja

`Wydarzenie.osobaId: string | null` zmienia się w `osobyId: string[]`.
Kolejność w tablicy odpowiada kolejności domowników w domu.

- **Formularz** — zamiast listy rozwijanej „Kto" zestaw przełączników z imionami
  i kropkami kolorów, wielokrotny wybór.
- **Siatka miesiąca i bloki godzin** — tło w kolorze pierwszej osoby, pozostałe
  jako kropki w rogu.
- **Panel dnia** — wszystkie imiona wypisane pod tytułem.
- **Filtr** — wydarzenie widać, dopóki widoczna jest choć jedna z jego osób.
  Wydarzenie bez osób nadal wpada pod przełącznik „Bez osoby".

## Testy

Dochodzą przypadki na filtrowanie: wydarzenie z dwiema osobami przy ukryciu
jednej z nich, przy ukryciu obu, oraz wydarzenie bez osób.

## Weryfikacja

- `npm test`, `npm run lint`, `npm run build`.
- Reguły RLS zapytaniami SQL z perspektywy ról — w szczególności próba dopisania
  się dziecka do cudzego wydarzenia.
- W przeglądarce: wydarzenie z trzema osobami we wszystkich trzech widokach
  i zachowanie filtra przy ukrywaniu kolejnych uczestników.
