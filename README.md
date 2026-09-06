# Kokpit Rodzinny

Wspólny kalendarz rodzinny — widok miesiąca, dodawanie wydarzeń (tytuł + godzina),
przełączanie miesięcy. Wydarzenia zapisują się w bazie Supabase, więc widzi je
każdy domownik, który otworzy aplikację.

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

## Struktura

| Plik | Do czego służy |
| --- | --- |
| `src/App.tsx` | Cały kalendarz: siatka miesiąca, panel dnia, formularz |
| `src/dates.ts` | Polskie nazwy miesięcy i dni, budowanie siatki kalendarza |
| `src/lib/supabase.ts` | Połączenie z bazą i typ wydarzenia |
| `supabase/schema.sql` | SQL tworzący tabelę `events` i reguły dostępu |

## Uwaga o dostępie

Reguły w `schema.sql` pozwalają czytać, dodawać i usuwać wydarzenia każdemu,
kto ma adres aplikacji — nie ma logowania. To wygodne dla kalendarza w rodzinie,
ale nie nadaje się do danych, które mają pozostać prywatne. Jeśli kiedyś zechcesz
ograniczyć dostęp, trzeba dodać logowanie (Supabase Auth) i zawęzić reguły.

## Skrypty

| Polecenie | Efekt |
| --- | --- |
| `npm run dev` | Serwer deweloperski z podglądem na żywo |
| `npm run build` | Wersja produkcyjna do katalogu `dist` |
| `npm run preview` | Podgląd zbudowanej wersji |
| `npm run lint` | Sprawdzenie kodu (oxlint) |
