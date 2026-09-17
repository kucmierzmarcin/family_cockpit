# Paczki InPost

Data: 2026-09-17
Status: zaakceptowany projekt, przed planem wdrożenia

## Po co

Domownik chce wiedzieć, **co czeka na niego w paczkomacie i do kiedy ma to
odebrać**, bez otwierania aplikacji InPost i bez szukania SMS-a. Paczka
przepadająca do nadawcy, bo nikt nie zauważył terminu, to konkretna strata —
i dokładnie ten rodzaj rzeczy, który ten kokpit ma pilnować za dom.

## Skąd dane — i dlaczego akurat stamtąd

**Nie istnieje oficjalne API, które po numerze telefonu zwróci paczki.** To nie
jest przeoczenie InPostu, tylko granica prywatności: publiczne API po numerze
telefonu pozwoliłoby każdemu sprawdzić, gdzie leży czyjaś paczka.

Sprawdzone 2026-09-17:

| Droga | Co daje | Werdykt |
|---|---|---|
| ShipX PL `GET api-shipx-pl.easypack24.net/v1/tracking/<numer>` | Śledzenie po numerze **przesyłki**, bez tokenu (zweryfikowane: zmyślony numer zwraca `404`, nie `401`) | Odrzucone jako źródło główne — numery trzeba by wpisywać ręcznie |
| Global Tracking / ShipX (OAuth) | API dla nadawców, po numerze przesyłki | Nie dotyczy — jesteśmy odbiorcą, nie nadawcą |
| Prywatne API aplikacji mobilnej | Lista paczek przypisanych do numeru telefonu, z terminem odbioru | **Wybrane** |

Aplikacja mobilna InPost loguje się numerem telefonu i kodem SMS. To **nie jest
obchodzenie uwierzytelniania** — użytkownik loguje się swoim numerem kodem,
który sam otrzymuje. Ten sam układ, co istniejąca integracja z eduVULCAN:
nieoficjalne API, poświadczenia po stronie serwera, sesja która wygasa.

### Endpointy

Host: `https://api-inmobile-pl.easypack24.net`

| Cel | Wywołanie |
|---|---|
| Wyślij kod SMS | `POST /v1/account` |
| Potwierdź kod, odbierz token | `POST /v1/account/verification` |
| Odśwież token | `POST /v1/authenticate` |
| Paczki przychodzące | `GET /v4/parcels/tracked` |

### Pola paczki

`shipmentNumber`, `status`, **`expiryDate`** (termin odbioru — sedno tej
funkcji), `storedDate`, `sender`, `pickUpPoint{name, city, street,
buildingNumber}`, `openCode`.

Statusy znaczące „czeka do odbioru": `Gotowa do odbioru`, `Gotowa do odbioru w
PaczkoPunkcie`, `Gotowa do odbioru z oddziału`, `Przesyłka magazynowana w
paczkomacie tymczasowym`.

> Pola i endpointy ustalone z kodu publicznej biblioteki `IFOSSA/inpost-python`,
> **nie z żywej odpowiedzi API**. Pierwszym zadaniem wdrożenia jest zrzucić
> surową odpowiedź `/v4/parcels/tracked` i potwierdzić kształt — tą samą metodą,
> którą złapano rozjazd `Date`/`DateAt` w Vulcanie.

## Architektura

Powtórzenie wzorca Vulcana, nie nowy pomysł:

- poświadczenia w tabeli z włączonym RLS i **zerową liczbą polityk** —
  dostęp wyłącznie przez `service_role`, czyli z Edge Function;
- dane merytoryczne: cały dom czyta, klient nie zapisuje nic;
- bezpieczna projekcja SQL pokazuje ekranowi stan połączenia, nigdy tokenu;
- osobna funkcja do parowania, osobna do synchronizacji;
- padnięta sesja to status, nie wyjątek — widoczny w „Mój dom".

### Połączenie per domownik, nie per dom

W odróżnieniu od Vulcana (`unique (household_id)`) InPost wiąże się z
**numerem telefonu konkretnej osoby**, więc każdy domownik paruje się sam:
`unique (member_id)`. Paczki widzi natomiast **cały dom**, z kropką w kolorze
właściciela — tak jak kalendarz koloruje wydarzenia.

To świadoma decyzja o prywatności: domownicy widzą nawzajem swoje przesyłki
(nadawcę i termin). Dla gospodarstwa domowego to cecha, nie wada — ale jest
wyborem, nie przypadkiem.

## Model danych

```sql
create table public.inpost_connections (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.members(id) on delete cascade,
  household_id      uuid not null references public.households(id) on delete cascade,
  phone             text not null,
  auth_token        text not null,
  refresh_token     text not null,
  token_expires_at  timestamptz,
  status            text not null default 'aktywne',
  last_error        text,
  created_at        timestamptz not null default now(),
  constraint inpost_connections_status_check
    check (status in ('aktywne', 'wymaga_ponownego_logowania')),
  unique (member_id)
);

create table public.inpost_parcels (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  member_id        uuid not null references public.members(id) on delete cascade,
  shipment_number  text not null,
  status           text not null,
  sender_name      text,
  point_name       text,
  point_address    text,
  expiry_date      timestamptz,
  stored_date      timestamptz,
  updated_at       timestamptz not null default now(),
  unique (member_id, shipment_number)
);
```

### Kodu odbioru NIE zapisujemy

`openCode` celowo nie ma w schemacie. Kod odbioru jest de facto kluczem do
skrytki: zapisany w bazie i pokazany całemu domowi przestaje być tajemnicą, a
wyciek bazy staje się wyciekiem kodów do cudzych przesyłek. Zakładka mówi *co*
czeka i *do kiedy*; po kod odsyła do aplikacji InPost albo SMS-a.

### RLS

```sql
alter table public.inpost_connections enable row level security;
alter table public.inpost_parcels     enable row level security;

-- inpost_connections: CELOWO bez żadnej polityki - trzyma tokeny,
-- dostęp wyłącznie service_role (wzorzec vulcan_connections).

create policy "Paczki InPost - odczyt" on public.inpost_parcels
  for select to authenticated
  using (household_id = public.moj_dom());
-- zapis: brak polityki; dane płyną tylko z Edge Function kluczem serwisowym
```

### Bezpieczna projekcja

```sql
create or replace function public.status_polaczenia_inpost()
returns table (member_id uuid, phone text, status text, last_error text)
```

Zwraca numer w postaci skróconej (`•••789`) i stan połączenia dla domowników
bieżącego domu. Nigdy nie zwraca tokenów.

## Funkcje brzegowe

### `inpost-polacz`

Dwa kroki, obie ścieżki wołane z ekranu „Mój dom":

1. `{ krok: 'sms', phone }` → woła `POST /v1/account`, nic nie zapisuje.
2. `{ krok: 'potwierdz', phone, kod }` → woła `POST /v1/account/verification`,
   zapisuje tokeny w `inpost_connections`.

Numer i kod wpisuje użytkownik; przechodzą przez tę funkcję i nigdzie indziej.

### `inpost-sync`

Wyzwalana `pg_cron` co 30 minut oraz przyciskiem „Odśwież teraz" (ten sam
wzorzec, co `vulcan-sync`). Dla każdego aktywnego połączenia:

1. odśwież token, jeśli blisko wygaśnięcia (`POST /v1/authenticate`);
   niepowodzenie → `status = 'wymaga_ponownego_logowania'` i koniec dla tego
   domownika, bez przerywania pozostałych;
2. `GET /v4/parcels/tracked`;
3. wstaw/zaktualizuj paczki o statusie „czeka do odbioru";
4. usuń wiersze, których API już nie zwraca w tych statusach (odebrane,
   zwrócone) — tabela trzyma stan bieżący, nie historię.

Częstotliwość 30 minut, bo termin odbioru liczy się w dniach, a nie minutach;
rzadziej niż `pg_cron` co 15 minut przy porannym mailu, częściej niż dobowa
synchronizacja Vulcana.

## Ekran „Paczki"

Nowa zakładka pod **„Więcej"** na telefonie (dolny pasek ma komplet pięciu
celów i limit zostaje nienaruszony) oraz w pasku zakładek na biurku.

Lista paczek całego domu, posortowana po terminie odbioru rosnąco:

- kropka w kolorze właściciela i jego imię;
- nadawca i nazwa paczkomatu z adresem;
- **termin odbioru** z wyróżnieniem, gdy mija dziś albo jutro — ta sama
  konwencja, co „dni po terminie" w Terminach;
- stan pusty: „Nic nie czeka na odbiór."

Parowanie i stan połączenia żyją w „Mój dom", obok sekcji Vulcana.

### Punkty styku z nawigacją

Nowy ekran wymaga wpisu w trzech miejscach `uklad/nawigacja.ts`: wartości
`'paczki'` w typie `Ekran`, tytułu w `TYTULY`, slugu w `SLUGI` (`paczki`) oraz
dopisania do `EKRANY` i `EKRANY_WIECEJ` (nie do `EKRANY_TELEFON` — pasek ma
limit pięciu celów, pilnuje go test). Ekran jest tylko do odczytu, więc
`etykietaDodania` zwraca dla niego `null`, tak jak dla „Szkoły".

Adres: `#/paczki`. Bez segmentów szczegółu — ekran nie ma podzakładek.

## Powiadomienia

**Licznik na „Dziś"** — szósty kafelek „Paczki do odbioru", czerwony gdy
cokolwiek wygasa dziś lub jutro, klikalny do zakładki. Wpina się w istniejący
`LicznikDnia` i `dashboardLiczniki.ts`.

**Poranny mail** — linijka w `podsumowanie_domu()` w bazie, dzięki czemu
korzysta z niej także bot, gdyby kiedyś miał o paczkach mówić.

Bot na Telegramie: celowo poza zakresem tej zmiany.

## Decyzje (podsumowanie)

| Decyzja | Wybór | Dlaczego |
|---|---|---|
| Źródło danych | Prywatne API mobilne | Jedyne, które zna numer telefonu; brak oficjalnej alternatywy |
| Zasięg połączenia | Per domownik | InPost wiąże konto z numerem osoby, nie domu |
| Widoczność paczek | Cały dom | Kokpit rodzinny; kolor właściciela rozróżnia |
| `openCode` | Nie zapisujemy | Klucz do skrytki nie ma czego szukać w bazie |
| Miejsce zakładki | Pod „Więcej" | Dolny pasek ma limit pięciu celów |
| Odświeżanie | cron 30 min + ręcznie | Termin liczy się w dniach |
| Retencja | Tylko stan bieżący | Historia odebranych paczek nikomu tu nie służy |

## Otwarte ryzyka / przyszła praca

- **Prywatne API może zniknąć bez uprzedzenia.** Autorzy bibliotek
  społecznościowych ostrzegają o tym wprost. Ryzyko identyczne jak przy
  Vulcanie i akceptowane z tych samych powodów.
- **Nie da się tego przetestować bez żywego konta.** Parowanie wymaga numeru
  telefonu i kodu SMS właściciela; pierwsze parowanie i test wykonuje
  użytkownik. Żaden agent nie wpisuje cudzych poświadczeń.
- **Kształt odpowiedzi potwierdzony z kodu biblioteki, nie z API.** Pierwsze
  zadanie planu to żywy zrzut i weryfikacja.
- Limity zapytań nieudokumentowane — 30-minutowy cron przy kilku domownikach
  to kilkanaście wywołań dziennie, czyli rząd wielkości ruchu zwykłej
  aplikacji mobilnej.
- Poza zakresem: otwieranie skrytki (wymaga sesji `collect` i fizycznej
  obecności przy paczkomacie), paczki nadawane, paczki współdzielone
  (`/v4/parcels/shared`), bot.

## Źródła

- [Tracking APIs — InPost Developers Portal](https://developers.inpost-group.com/tracking)
- [IFOSSA/inpost-python](https://github.com/IFOSSA/inpost-python) — model paczki, statusy, endpointy
- [ha-parcel-integrations/ha-inpost](https://github.com/ha-parcel-integrations/ha-inpost) — ostrzeżenie o prywatnym API
- [Aplikacja mobilna InPost](https://inpost.pl/en/mobile-application)
