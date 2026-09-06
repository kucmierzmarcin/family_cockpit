# Kokpit Rodzinny

Wspólny kalendarz rodzinny — widok miesiąca, dodawanie wydarzeń (tytuł + godzina),
przełączanie miesięcy. Wydarzenia zapisują się w bazie Supabase, więc widzi je
każdy zalogowany domownik.

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
| `src/App.tsx` | Kalendarz: siatka miesiąca, panel dnia, formularz, filtry osób |
| `src/MojDom.tsx` | Ekran „Mój dom": domownicy, role, konta |
| `src/useDomownicy.ts` | Wczytywanie i zmiany listy domowników |
| `src/kolory.ts` | Paleta kolorów domowników |
| `src/dates.ts` | Polskie nazwy miesięcy i dni, budowanie siatki kalendarza |
| `src/lib/supabase.ts` | Połączenie z bazą i typy danych |
| `supabase/schema.sql` | Pełny schemat: tabele, funkcje i reguły dostępu |
| `supabase/start.sql` | Skrypt uruchamiany raz — zakłada pierwszy dom |

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
