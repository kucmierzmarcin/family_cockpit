# Ważne terminy

Data: 2026-09-12
Dotyczy: Kokpit Rodzinny, nowa zakładka (poza numeracją #0–#8 planu budowy)

## Po co

Miejsce na terminy, o których trzeba pamiętać niezależnie od kalendarza —
np. do kiedy ważne jest ubezpieczenie auta, przegląd techniczny, gwarancja —
razem z dokumentem, który do tego terminu należy (skan polisy, zdjęcie
dowodu rejestracyjnego). Kalendarz odpowiada na „co się dzieje kiedy",
ta zakładka na „o co trzeba zadbać do kiedy" — inny kształt danych
(pojedyncza data + dokument, nie przedział godzinowy) i inny cykl życia
(termin trwa, aż ktoś go „załatwi", nie znika sam po minięciu dnia).

Świadomie **bez przypomnień** (mail/bot) w tej wersji — to osobny temat, do
podjęcia później, jeśli się okaże potrzebny. Ta wersja to przeglądana lista.

## Decyzje

| Kwestia | Wybór |
| --- | --- |
| Widoczność | cały dom widzi i dodaje — jak tablica |
| Edycja/usuwanie terminu | autor albo rodzic |
| Odhaczanie „załatwione” | każdy z domu (porządkowanie, nie ingerencja w cudzą treść — jak przypinanie notatki) |
| Edycja pól (tytuł/opis/data) | brak — spójnie z notatkami/zakupami; pomyłkę poprawia się usunięciem i dodaniem od nowa |
| Załatwione terminy | chowają się z głównej listy; przełącznik „Pokaż załatwione” pokazuje je z powrotem |
| Załączniki | kilka plików na termin, dodaje każdy z domu, usuwa wgrywający albo rodzic |
| Typ/rozmiar załącznika | zdjęcia i PDF, do 10 MB/plik |
| Kategorie/tagi | brak — dodać dopiero, gdy lista realnie urośnie |
| Przypomnienia (mail/bot) | brak w tej wersji |

## Model danych

```sql
create table deadlines (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  title        text not null,
  description  text,
  due_date     date not null,
  completed    boolean not null default false,
  completed_at timestamptz,
  created_by   uuid references members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table deadline_attachments (
  id           uuid primary key default gen_random_uuid(),
  deadline_id  uuid not null references deadlines(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  content_type text not null,
  size_bytes   bigint not null,
  created_by   uuid references members(id) on delete set null,
  created_at   timestamptz not null default now()
);
```

Usunięcie terminu kasuje jego załączniki w bazie (`on delete cascade`) — pliki
w Storage trzeba skasować osobno, przy tej samej operacji (patrz Pliki
w Storage), bo skasowanie wiersza nie usuwa obiektu w buckecie.

## Reguły dostępu (RLS)

Ten sam wzorzec co `notes`: `household_id` domyślnie z `moj_dom()`,
`created_by` domyślnie z `ja_jako_member()`, funkcja `moj_termin(uuid)`
analogiczna do `moja_notatka(uuid)`.

| Tabela | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| `deadlines` | mój dom | każdy z domu | każdy z domu | autor lub rodzic |
| `deadline_attachments` | mój dom (przez `deadline_id`) | każdy z domu | — (bez update) | wgrywający lub rodzic |

`deadline_attachments` nie ma kolumny `household_id` — polityki sprawdzają
dom przez `exists (select 1 from deadlines d where d.id = deadline_id and
d.household_id = moj_dom())`, tym samym wzorcem `SECURITY DEFINER`, którym
`shopping_items` sięga do domu przez `shopping_lists`.

## Pliki w Storage

Prywatny bucket `deadline-attachments`:

- `file_size_limit` 10 MB, `allowed_mime_types` `['image/*', 'application/pdf']`
  na poziomie bucketu (obrona w głąb — klient waliduje to samo przed uploadem,
  ale bucket pilnuje tego niezależnie od tego, co wyśle przeglądarka).
- Ścieżka obiektu: `{household_id}/{deadline_id}/{losowy-id}-{nazwa-pliku}`.
- Polityki na `storage.objects` (bucket `deadline-attachments`) porównują
  pierwszy segment ścieżki (`storage.foldername(name)[1]`) z `moj_dom()::text`
  — insert i select dla całego domu, delete dla wgrywającego albo rodzica
  (ten sam podział co w tabeli `deadline_attachments`, bo oba muszą się
  zgadzać: metadana bez pliku albo plik bez metadanej to zepsuty stan).
- Podgląd pliku: `createSignedUrl` na żądanie (klik w załącznik w UI) —
  krótkoterminowy link, nic nie jest publicznie dostępne na stałe.
- Usunięcie terminu: aplikacja najpierw kasuje obiekty Storage danego
  `deadline_id` (`remove()` po liście `storage_path` z `deadline_attachments`),
  potem wiersz `deadlines` (kaskada zabiera wiersze `deadline_attachments`).
  Kolejność ma znaczenie — po skasowaniu wiersza traci się listę
  `storage_path` do posprzątania.

## Ekran

Piąta zakładka, „Terminy” — w nawigacji obok Kalendarz/Zakupy/Tablica/Mój dom.

- Formularz dodania: tytuł, opis (opcjonalny), data. Załączniki dodaje się
  dopiero po zapisaniu terminu (potrzebny `deadline_id` jako folder
  w Storage) — od razu na widoku szczegółu/karty świeżo dodanego terminu.
- Lista posortowana rosnąco po `due_date`; przeterminowane i nieodhaczone
  wyróżnione kolorem/etykietą.
- Karta terminu: tytuł, opis, data, checkbox „załatwione”, lista załączników
  (nazwa pliku → klik otwiera signed URL w nowej karcie), przycisk dodania
  kolejnego załącznika, usuwanie pojedynczego załącznika i całego terminu
  (widoczne zależnie od uprawnień).
- Przełącznik „Pokaż załatwione” nad listą — domyślnie wyłączony (odhaczone
  schowane).
- Realtime na `deadlines` i `deadline_attachments`, ten sam wzorzec co
  `notes`/`shopping_items` — zmiana u jednego domownika widoczna od razu
  u pozostałych.

## Pliki

| Plik | Rola |
| --- | --- |
| `src/Terminy.tsx` | nowy — ekran listy i formularza |
| `src/useTerminy.ts` | nowy — dane, Realtime, operacje (w tym upload/usuwanie w Storage) |
| `src/terminy.ts` | nowy — sortowanie, etykieta przeterminowania, walidacja pliku przed uploadem |
| `src/terminy.test.ts` | nowy — testy tej logiki |
| `src/lib/supabase.ts` | typy `TerminDb`, `ZalacznikDb` |
| `src/uklad/nawigacja.ts` | piąty ekran `'terminy'`, tytuł, etykieta dodania |
| `src/App.tsx` | piąta zakładka |
| `src/style/*.css` | style karty terminu |
| `supabase/schema.sql` | tabele, RLS, publikacja Realtime, bucket + polityki Storage |

## Świadomie pomijam

Przypomnienia mailem/botem o zbliżającym się terminie, kategorie/tagi,
edycję pól istniejącego terminu, podgląd miniatur zdjęć na liście (na razie
sama nazwa pliku), współdzielenie terminów między domami, limit liczby
załączników na termin (10 MB/plik i tak naturalnie ogranicza nadużycie).

## Weryfikacja

- Testy jednostkowe: sortowanie po dacie, wyliczanie „przeterminowany”,
  walidacja typu/rozmiaru pliku przed uploadem.
- Reguły RLS zapytaniami z perspektywy ról: czy dziecko odhaczy cudzy
  termin (powinno), czy usunie cudzy termin (nie powinno, chyba że rodzic),
  czy usunie cudzy załącznik (nie powinno), czy obcy z innego domu
  zobaczy/pobierze cokolwiek — wiersze i pliki w Storage (nie powinien).
- Test na żywo w dwóch kartach przeglądarki: dodanie terminu i odhaczenie
  w jednej ma pojawić się w drugiej bez odświeżania.
- Ręczny test pełnej ścieżki: dodaj termin → dołącz zdjęcie i PDF → otwórz
  oba przez signed URL → odhacz → zniknięcie z listy → włącz „Pokaż
  załatwione” → termin wraca → usuń termin → pliki znikają ze Storage
  (nie tylko wiersz w bazie).
