import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'
import { utworzLimiterInpost } from './src/inpostLimiter.js'

// Jeden limiter na cały czas życia procesu `npm run dev` - patrz komentarz
// w src/inpostLimiter.ts o tym, czemu to jedyne miejsce, gdzie da się
// ograniczyć wysyłkę SMS-ów przez InPost.
const limiterInpost = utworzLimiterInpost()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Wysłanie SMS-a z kodem InPostu MUSI wyjść z łącza domownika, nie z
      // serwerowni Supabase: sprawdzone doświadczalnie - to samo żądanie
      // wysłane przez funkcję brzegową dostaje HTTP 200 i nie wysyła nic,
      // a wysłane stąd wysyła SMS. Przeglądarka nie może zawołać InPostu
      // bezpośrednio (preflight CORS dostaje 403, a jedyny typ treści bez
      // preflightu - text/plain - API odrzuca), więc pośredniczy Vite:
      // strona woła własny adres, a Node przekazuje żądanie dalej.
      //
      // UWAGA: to działa TYLKO przy `npm run dev`. Zbudowana, wdrożona
      // aplikacja nie ma tego proxy - patrz README, sekcja o InPoście.
      '/inpost-api': {
        target: 'https://api-inmobile-pl.easypack24.net',
        changeOrigin: true,
        // Numer telefonu leci też jako `?tel=` (patrz ParowanieInpost.tsx) -
        // wyłącznie po to, żeby `bypass` niżej mógł go przeczytać z URL-a bez
        // czytania strumienia body. InPost go nie widzi: `rewrite` ucina
        // wszystko od `?` przed przekazaniem dalej.
        rewrite: (sciezka) => sciezka.replace(/^\/inpost-api/, '').replace(/\?.*$/, ''),
        // Nagłówek aplikacji mobilnej - taki sam, jakim posłużyło się
        // żądanie, które faktycznie dostarczyło SMS. Przeglądarka nie może
        // ustawić `User-Agent` sama, więc dokłada go proxy.
        headers: {
          'User-Agent': 'InPost-Mobile/3.23.0(32300001) (Android 9; unknown; unknown unknown; en)',
        },
        // Rate-limiting: bez tego zalogowany domownik mógłby tym proxy
        // zbombardować SMS-ami dowolny numer telefonu, nie tylko własny.
        bypass(req, res) {
          const tel = new URL(req.url ?? '', 'http://localhost').searchParams.get('tel')
          if (tel && res && !limiterInpost.pozwalaj(tel)) {
            res.statusCode = 429
            res.setHeader('Content-Type', 'application/json; charset=UTF-8')
            res.end(JSON.stringify({ blad: 'Zbyt wiele prób dla tego numeru - spróbuj później.' }))
            return false
          }
        },
      },
    },
  },
  test: {
    // vulcanPodpis.test.ts to test Deno (Deno.test + import z https://deno.land/std) -
    // celowo niekompatybilny z ESM-loaderem vitest, uruchamiany przez `deno test`
    // (patrz nagłówek pliku supabase/functions/_wspolne/vulcanPodpis.ts).
    exclude: [...configDefaults.exclude, 'supabase/functions/_wspolne/vulcanPodpis.test.ts'],
    // Produkcja (Deno Edge Functions) chodzi w UTC, więc testy mają odtwarzać
    // to środowisko, nie biurko dewelopera. Bez tego test przechodzi albo
    // pada zależnie od strefy maszyny uruchamiającej `vitest run` - żaden kod
    // dat w repo nie był na to sprawdzany (znalezione przy recenzji
    // liniaPaczki/dzienMiesiac w podsumowanie.ts).
    env: { TZ: 'UTC' },
  },
})
