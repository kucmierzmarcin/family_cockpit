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
  const kluczSerwisowy = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`

  // Wywołanie z pg_cron używa klucza service_role wprost - to jedyny sygnał,
  // po którym rozróżniamy "synchronizuj wszystkie due domy" (cron) od
  // "synchronizuj mój dom teraz" (przycisk w Mój dom, JWT zwykłego użytkownika).
  if (autoryzacja === kluczSerwisowy) {
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
