import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig, type Plugin } from 'vitest/config'
import { utworzLimiterInpost, type LimiterInpost } from './src/inpostLimiter.js'

const TUTAJ = path.dirname(fileURLToPath(import.meta.url))
const SKRYPT_PYTHON = path.join(TUTAJ, 'scripts', 'wyslij_sms_inpost.py')

/**
 * Prośba o kod SMS InPostu - przez Pythona, NIE przez zwykły `fetch()`/proxy
 * Node.js.
 *
 * Żywy test 2026-09-18 (patrz pamięć projektu "kokpit-plan-budowy") wykazał,
 * że Cloudflare przed InPostem cicho blokuje to zadanie z Node.js - identyczne
 * żądanie (te same nagłówki, ten sam kontrakt) zwraca 200, ale NIGDY nie
 * wysyła SMS-a, niezależnie od tego, czy leci z serwerowni Supabase, przez
 * `http-proxy` Vite, czy przez zwykły Node'owy `fetch()` z domowej sieci. To
 * samo żądanie z Pythona (inny stos TLS/HTTP) przechodzi i SMS dociera -
 * potwierdzone dwukrotnie żywym testem. Stąd ten proces potomny zamiast
 * `server.proxy` - jedyny sposób, żeby przycisk „Wyślij kod SMS" w appce
 * faktycznie działał, a nie tylko wyglądał na działający (HTTP 200 bez
 * realnego skutku, jak poprzednio).
 *
 * Potwierdzenie kodu (`inpost-polacz`, Deno na Supabase) i synchronizacja
 * paczek (`inpost-sync`, też Deno) NIE mają tego problemu - żywo potwierdzone,
 * że przechodzą bez przeszkód. Blokada dotyczy wyłącznie kroku "poproś o SMS".
 *
 * UWAGA: to działa TYLKO przy `npm run dev`, i tylko gdy `python` jest w
 * PATH. Zbudowana, wdrożona aplikacja nie ma tego middleware'u - patrz
 * README, sekcja o InPoście.
 */
function pluginSmsInpostPrzezPythona(limiter: LimiterInpost): Plugin {
  return {
    name: 'inpost-sms-przez-pythona',
    configureServer(server) {
      server.middlewares.use('/inpost-api/v1/sendSMSCode', (req, res) => {
        // Ciało żądania nie jest nam potrzebne - numer leci w `?tel=` (patrz
        // ParowanieInpost.tsx) - ale strumień trzeba osuszyć, inaczej
        // połączenie keep-alive potrafi zawisnąć.
        req.resume()

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }

        const tel = new URL(req.url ?? '', 'http://localhost').searchParams.get('tel')
        if (!tel) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json; charset=UTF-8')
          res.end(JSON.stringify({ blad: 'Brak numeru telefonu.' }))
          return
        }

        // Rate-limiting: bez tego zalogowany domownik mógłby tym proxy
        // zbombardować SMS-ami dowolny numer telefonu, nie tylko własny.
        if (!limiter.pozwalaj(tel)) {
          res.statusCode = 429
          res.setHeader('Content-Type', 'application/json; charset=UTF-8')
          res.end(JSON.stringify({ blad: 'Zbyt wiele prób dla tego numeru - spróbuj później.' }))
          return
        }

        execFile('python', [SKRYPT_PYTHON, tel], { timeout: 20_000 }, (blad, stdout) => {
          if (blad) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json; charset=UTF-8')
            res.end(
              JSON.stringify({
                blad: `Nie udało się uruchomić Pythona - wymagany, żeby ominąć blokadę InPostu na Node.js (zainstaluj Python 3, upewnij się że "python" jest w PATH): ${blad.message}`,
              }),
            )
            return
          }
          try {
            const wynik = JSON.parse(stdout) as { status: number; body: string }
            res.statusCode = wynik.status
            res.setHeader('Content-Type', 'application/json; charset=UTF-8')
            res.end(wynik.body)
          } catch {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json; charset=UTF-8')
            res.end(JSON.stringify({ blad: 'Skrypt Pythona zwrócił coś, czego nie dało się rozpoznać.' }))
          }
        })
      })
    },
  }
}

// Jeden limiter na cały czas życia procesu `npm run dev` - patrz komentarz
// w src/inpostLimiter.ts o tym, czemu to jedyne miejsce, gdzie da się
// ograniczyć wysyłkę SMS-ów przez InPost.
const limiterInpost = utworzLimiterInpost()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pluginSmsInpostPrzezPythona(limiterInpost)],
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
