import { createClient } from 'npm:@supabase/supabase-js@2'
import { synchronizujDom } from '../_wspolne/vulcanSync.ts'

type Kandydat = { log_id: string; household_id: string }

Deno.serve(async (req) => {
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
      return new Response(JSON.stringify({ blad: error.message }), { status: 500 })
    }

    const wyniki = []
    for (const k of (kandydaci ?? []) as Kandydat[]) {
      const wynik = await synchronizujDom(baza, k.household_id)
      await baza.rpc('zamknij_sync_vulcan', { p_log: k.log_id, p_blad: wynik.blad ?? null })
      wyniki.push({ household_id: k.household_id, ...wynik })
    }
    return new Response(JSON.stringify({ przetworzono: wyniki.length, wyniki }), {
      headers: { 'Content-Type': 'application/json' },
    })
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
    return new Response(JSON.stringify({ blad: 'Nieprawidłowa sesja.' }), { status: 401 })
  }

  const { data: status, error: bladStatusu } = await klientUzytkownika.rpc('status_polaczenia_vulcan')
  const wlasnyDom = status?.[0]
  if (bladStatusu || !wlasnyDom?.istnieje) {
    return new Response(JSON.stringify({ blad: 'Brak połączenia z Vulcan dla tego domu.' }), { status: 400 })
  }

  const { data: czlonek } = await baza
    .from('members')
    .select('household_id')
    .eq('user_id', uzytkownik.user.id)
    .single()

  if (!czlonek) {
    return new Response(JSON.stringify({ blad: 'Nie znaleziono domownika.' }), { status: 400 })
  }

  const wynik = await synchronizujDom(baza, czlonek.household_id)
  return new Response(JSON.stringify(wynik), {
    status: wynik.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  })
})
