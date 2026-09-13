import { createClient } from 'npm:@supabase/supabase-js@2'
import { synchronizujDom } from '../_wspolne/vulcanSync.ts'

type Kandydat = { log_id: string; household_id: string }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function odpowiedz(tresc: unknown, status = 200): Response {
  return new Response(JSON.stringify(tresc), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

/**
 * Czy to wywołanie z pg_cron (klucz service_role), czy z przeglądarki (JWT
 * rodzica)?
 *
 * NIE porównujemy nagłówka ze `SUPABASE_SERVICE_ROLE_KEY` ze środowiska -
 * takie porównanie było wcześniejszym błędem: sekret Vault
 * `kokpit_klucz_serwisowy` (którym `net.http_post` buduje nagłówek) trzyma
 * klucz w formacie legacy JWT, a `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
 * po migracji API keys zwraca nowy format `sb_secret_...`. Dwa różne stringi,
 * porównanie nigdy prawdziwe, każdy tick crona kończył się 401.
 *
 * Czytamy więc rolę z samego tokenu. To bezpieczne, bo bramka Supabase ma dla
 * tej funkcji `verify_jwt: true` - podpis został zweryfikowany, zanim ten kod
 * w ogóle wystartował; my tylko odczytujemy zweryfikowany już ładunek. Dzięki
 * temu rozpoznanie jest niezależne od tego, w jakim formacie Supabase akurat
 * wydaje klucze service_role.
 */
export function jestWywolaniemSerwisowym(naglowekAutoryzacji: string): boolean {
  const dopasowanie = naglowekAutoryzacji.match(/^Bearer\s+(.+)$/)
  if (!dopasowanie) return false
  const czesci = dopasowanie[1].trim().split('.')
  if (czesci.length !== 3) return false
  try {
    const base64 = czesci[1].replace(/-/g, '+').replace(/_/g, '/')
    const uzupelnione = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const ladunek = JSON.parse(atob(uzupelnione)) as { role?: unknown }
    return ladunek.role === 'service_role'
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  // Przycisk "Odśwież teraz" (Zadanie 8) woła tę funkcję z przeglądarki przez
  // supabase.functions.invoke - to poprzedza preflight OPTIONS, który trzeba
  // obsłużyć samodzielnie (Deno.serve nie robi tego automatycznie).
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const baza = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const autoryzacja = req.headers.get('Authorization') ?? ''

  // Rola z tokenu rozróżnia "synchronizuj wszystkie due domy" (cron, klucz
  // service_role) od "synchronizuj mój dom teraz" (przycisk w Mój dom, JWT
  // zwykłego użytkownika).
  if (jestWywolaniemSerwisowym(autoryzacja)) {
    const { data: kandydaci, error } = await baza.rpc('vulcan_do_synchronizacji')
    if (error) {
      return odpowiedz({ blad: error.message }, 500)
    }

    const wyniki = []
    for (const k of (kandydaci ?? []) as Kandydat[]) {
      const wynik = await synchronizujDom(baza, k.household_id)
      await baza.rpc('zamknij_sync_vulcan', { p_log: k.log_id, p_blad: wynik.blad ?? null })
      wyniki.push({ household_id: k.household_id, ...wynik })
    }
    return odpowiedz({ przetworzono: wyniki.length, wyniki })
  }

  // Wywołanie z klienta: zwykły JWT, sprawdzamy rodzica i bierzemy jego dom
  // przez klucz anon + ten sam Authorization - RLS/RPC same przefiltrują.
  const klientUzytkownika = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autoryzacja } } },
  )

  const { data: uzytkownik } = await klientUzytkownika.auth.getUser()
  if (!uzytkownik.user) {
    return odpowiedz({ blad: 'Nieprawidłowa sesja.' }, 401)
  }

  const { data: status, error: bladStatusu } = await klientUzytkownika.rpc('status_polaczenia_vulcan')
  const wlasnyDom = status?.[0]
  if (bladStatusu || !wlasnyDom?.istnieje) {
    return odpowiedz({ blad: 'Brak połączenia z Vulcan dla tego domu.' }, 400)
  }

  const { data: czlonek } = await baza
    .from('members')
    .select('household_id')
    .eq('user_id', uzytkownik.user.id)
    .single()

  if (!czlonek) {
    return odpowiedz({ blad: 'Nie znaleziono domownika.' }, 400)
  }

  const wynik = await synchronizujDom(baza, czlonek.household_id)
  return odpowiedz(wynik, wynik.ok ? 200 : 500)
})
