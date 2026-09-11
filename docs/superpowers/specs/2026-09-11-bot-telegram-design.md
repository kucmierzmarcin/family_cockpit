# Bot na komunikatorze (Telegram) — spec

**Cel:** Domownik pisze do bota na Telegramie zwykłym językiem. Bot odpowiada,
co dziś/jutro czeka dom (ten sam kawałek co poranny mail), oraz dodaje
wydarzenia do kalendarza na podstawie opisu w wiadomości.

**Uwaga (odkryte przy pisaniu planu):** `podsumowanie_domu(p_dom, p_dzien)`
liczy się dla **jednego** dnia — pierwotny pomysł „ten tydzień" wymagałby
zmiany kontraktu tej funkcji, od której zależy już wdrożony mail. Zamiast
ryzykować regresję w działającej funkcji, V1 bota ogranicza się do „dziś" i
„jutro"; tydzień zostaje do sprawdzenia w samej aplikacji.

**Poza zakresem V1:** edycja i usuwanie istniejących wydarzeń przez czat,
ogólna pogawędka (bot poza dwiema powyższymi rolami grzecznie odsyła do tego,
co potrafi), czat grupowy (tylko rozmowa 1:1 bota z każdym domownikiem osobno),
wydarzenia powtarzające się (bot dodaje wyłącznie pojedyncze wystąpienia -
serię trzeba nadal założyć w apce).

## Architektura

Telegram wysyła webhook (HTTPS POST) przy każdej wiadomości do Edge Function
`telegram-bot`. Funkcja działa kluczem **service_role** — Telegram nie daje
sesji Supabase Auth, więc `auth.uid()` nigdy nie istnieje w tym kontekście i
reguły RLS niczego tu nie chronią. Każde sprawdzenie uprawnień i każdy dostęp
do danych domu funkcja robi jawnie, na podstawie `member_id` ustalonego przez
parowanie `chat_id`.

Rozpoznawanie intencji: Gemini function-calling (ten sam klient co
`import-ai`) z trzema narzędziami do wyboru:

- `pokaz_podsumowanie` — pytanie o kalendarz/tablicę/zakupy (dziś albo jutro).
- `zaproponuj_wydarzenie` — prośba o dodanie czegoś do kalendarza.
- `odpowiedz_tekstem` — nic z powyższych; bot krótko tłumaczy, co potrafi.

Wydarzenie nigdy nie zapisuje się od razu: `zaproponuj_wydarzenie` zapisuje
szkic i pyta o potwierdzenie. Odpowiedź „tak"/„nie" jest sprawdzana prostym
dopasowaniem słów, bez drugiego zapytania do Gemini.

## Parowanie konta

Telegram nie ma dostępu do maila/hasła domownika, więc parowanie idzie przez
jednorazowy kod:

1. W apce, w sekcji „Mój dom" (obok „Powiadomienia"), przycisk „Połącz z
   Telegramem" woła RPC `wygeneruj_kod_telegramu()` (tylko zalogowany, po
   `auth.uid()`) i pokazuje kod ważny 15 minut + link `t.me/<bot>`.
2. Domownik otwiera bota i wysyła `/start KOD`.
3. `telegram-bot` sprawdza kod przez RPC `polacz_telegram(kod, chat_id)`:
   nieprzeterminowany i istniejący → zapisuje `chat_id` przy domowniku,
   kasuje kod, odpowiada powitaniem po imieniu; zły/wygasły → prosi o nowy
   kod z apki.

Domownik bez konta w apce (dziecko bez loginu) nie może się sparować — tak
samo jak dziś nie dostaje maila, bo `polacz_moje_konto`/mail wymagają konta.

## Model danych (migracja `bot_telegram`)

```sql
alter table public.members
  add column if not exists telegram_chat_id bigint;

create unique index if not exists members_telegram_chat_id_key
  on public.members (telegram_chat_id) where telegram_chat_id is not null;

-- Kody parowania - jednorazowe, krotkotrwale. RLS wlaczone, zero polityk:
-- to sprawa service_role i security definer funkcji, nie przegladarki.
create table if not exists public.telegram_kody (
  kod        text primary key,
  member_id  uuid not null references public.members(id) on delete cascade,
  wygasa     timestamptz not null
);
alter table public.telegram_kody enable row level security;

-- Szkic wydarzenia czekajacy na potwierdzenie "tak"/"nie" - jeden na osobe,
-- nowa propozycja nadpisuje poprzednia (member_id jest kluczem glownym).
create table if not exists public.telegram_szkice (
  member_id   uuid primary key references public.members(id) on delete cascade,
  wydarzenie  jsonb not null,
  utworzono   timestamptz not null default now()
);
alter table public.telegram_szkice enable row level security;
```

**Nowe funkcje:**

- `wygeneruj_kod_telegramu() returns text` — `security definer`, wymaga
  `auth.uid()`, generuje losowy kod (np. 6 znaków), wstawia z `wygasa = now()
  + interval '15 minutes'`, zwraca kod. `revoke ... from anon`; `grant ...
  to authenticated`.
- `polacz_telegram(p_kod text, p_chat_id bigint) returns boolean` — jedno
  zapytanie: znajdź nieprzeterminowany kod, zaktualizuj
  `members.telegram_chat_id`, skasuj kod, zwróć czy się udało.
  `revoke ... from public, anon, authenticated` (tylko service_role/bot).
- `domownik_po_czacie(p_chat_id bigint) returns table (member_id uuid,
  household_id uuid, imie text)` — zwraca dane potrzebne do obsłużenia
  wiadomości. `revoke ... from public, anon, authenticated`.
- `dodaj_wydarzenie_bota(p_member uuid, p_tytul text, p_poczatek timestamp,
  p_koniec timestamp, p_calodniowe boolean, p_osoby uuid[]) returns uuid` —
  dobiera `household_id` z `p_member`, wstawia do `events` i `event_members`
  (jeśli `p_osoby` niepuste), zwraca `id` nowego wydarzenia.
  `revoke ... from public, anon, authenticated`. To jedyne miejsce, które
  ufa przekazanemu `p_member` bez własnej weryfikacji — wołające musi być
  Edge Function, która wcześniej ustaliła `member_id` przez
  `domownik_po_czacie`.

Każda zmiana schematu ląduje też w `supabase/schema.sql` (sekcja 18), zgodnie
z resztą projektu.

## Komponenty (pliki)

| Plik | Odpowiedzialność |
| --- | --- |
| `supabase/functions/telegram-bot/index.ts` | Webhook: `/start KOD`, zwykłe wiadomości, potwierdzenia tak/nie |
| `supabase/functions/_wspolne/telegram.ts` | Wysyłka wiadomości przez Telegram Bot API - jedyne miejsce, które o nim wie |
| `supabase/functions/_wspolne/botAI.ts` | Zapytanie do Gemini (3 narzędzia) + walidacja odpowiedzi - czyste funkcje, bez Deno |
| `supabase/functions/_wspolne/botAI.test.ts` | Testy jednostkowe `botAI.ts` |
| `supabase/functions/_wspolne/podsumowanie.ts` | Modyfikacja - opcja pominięcia stopki mailowej w `zbudujPodsumowanie` |
| `src/MojDom.tsx` | Modyfikacja - sekcja „Połącz z Telegramem" |
| `src/useDomownicy.ts` | Modyfikacja - `polaczTelegram()` wołające `wygeneruj_kod_telegramu` |
| `README.md` | Modyfikacja - opis funkcji + konfiguracja bota (token, webhook) |

`gemini.ts` (klient HTTP do Gemini) reużywa się bez zmian z `import-ai`.

## Konfiguracja (krok dla człowieka)

1. Założenie bota przez [@BotFather](https://t.me/BotFather) na Telegramie,
   uzyskanie tokena.
2. Sekret Edge Function: `TELEGRAM_BOT_TOKEN`.
3. Rejestracja webhooka (`setWebhook` na URL wdrożonej funkcji) — jednorazowe
   wywołanie z kluczem tokena, po wdrożeniu funkcji.

## Obsługa błędów

- Wiadomość od nierozpoznanego `chat_id` → zawsze odpowiedź z instrukcją
  parowania, żadna inna logika się nie uruchamia.
- Błąd/timeout Gemini → „Coś poszło nie tak, spróbuj ponownie za chwilę.",
  błąd zalogowany (jak w `import-ai`).
- Szkic w `telegram_szkice` starszy niż 10 minut jest ignorowany przy
  sprawdzaniu potwierdzenia (i można go bezpiecznie nadpisać/skasować) —
  zapobiega przypadkowemu „tak" wysłanemu dużo później.
- Webhook zawsze odpowiada Telegramowi szybko (2xx), żeby ten nie ponawiał
  dostawy tej samej wiadomości.

## Testowanie

Jednostkowe dla `botAI.ts` (budowa zapytania, walidacja odpowiedzi Gemini,
rozpoznawanie tak/nie) tym samym wzorcem co `importAI.test.ts` — bez
wywoływania prawdziwego Gemini. Żywy test na koniec wdrożenia: parowanie,
pytanie o dzisiejszy dzień, dodanie wydarzenia z potwierdzeniem — analogicznie
do żywego testu maila.
