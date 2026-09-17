import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
