import { createClient } from 'npm:@supabase/supabase-js@2'
import { cialoPotwierdzeniaKodu } from '../_wspolne/inpostApi.ts'

const HOST = 'https://api-inmobile-pl.easypack24.net'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Cialo = { phone?: string; kod?: string }

// Naglowki 1:1 jak w `ha-parcel-integrations/ha-inpost` (potwierdzone na
// zywym koncie 2026-08-15) - to jedyne, czym to API odroznia swojego klienta;
// wysylamy je, zeby nie roznic sie od dzialajacej referencji.
const NAGLOWKI_INPOST = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': 'InPost-Mobile/3.27.2 (Android 14; SDK 34) okhttp/4.11.0',
  'X-Api-Version': '1',
}

function bladJson(tekst: string, status: number): Response {
  return new Response(JSON.stringify({ blad: tekst }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function okJson(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') return bladJson('Tylko POST.', 405)

  let cialo: Cialo
  try {
    cialo = await req.json()
  } catch {
    return bladJson('Nieprawidłowy JSON.', 400)
  }

  // Domownika bierzemy z JWT wolajacego, NIGDY z ciala zadania - inaczej kazdy
  // moglby podpiac swoj numer pod cudze konto.
  //
  // Ta funkcja miala kiedys drugi krok, 'sms', ktory prosil InPost o kod.
  // Zostal usuniety, bo z serwerowni nie dziala: InPost odpowiada 200 i nie
  // wysyla nic. Prosba o kod idzie dzis wprost z przegladarki domownika przez
  // proxy serwera deweloperskiego (patrz `vite.config.ts`). Stary kontrakt
  // (`/v1/account`) nie dostarczal SMS-a z ZADNEJ drogi (ani stad, ani z
  // przegladarki) - 2026-09-18 przepiety na nowy, zywo potwierdzony kontrakt
  // (`/v1/sendSMSCode`+`/v1/confirmSMSCode`), patrz pamiec projektu
  // "kokpit-plan-budowy" po pelna diagnoze i zastrzezenia.
  //
  // GDYBY ktos kiedys chcial ten krok tu przywrocic (albo naprawic obecna
  // sciezke): bramka ponizej MUSI obowiazywac takze jego. Zapytanie o kod
  // wysyla realny SMS pod dowolny numer, a klucz anon jest publiczny -
  // "wymagany JWT" na poziomie platformy Supabase sam z siebie nie zatrzyma
  // nikogo, kto chcialby uzyc tej funkcji do bombardowania SMS-ami cudzych
  // numerow.
  const autoryzacja = req.headers.get('Authorization')
  if (!autoryzacja) return bladJson('Brak autoryzacji.', 401)

  const klientUzytkownika = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autoryzacja } } },
  )

  const { data: uzytkownik, error: bladUzytkownika } = await klientUzytkownika.auth.getUser()
  if (bladUzytkownika || !uzytkownik.user) return bladJson('Nieprawidłowa sesja.', 401)

  const { data: czlonek, error: bladCzlonka } = await klientUzytkownika
    .from('members')
    .select('id, household_id')
    .eq('user_id', uzytkownik.user.id)
    .single()
  if (bladCzlonka || !czlonek) return bladJson('Nie znaleziono domownika.', 400)

  const phone = (cialo.phone ?? '').replace(/\D/g, '')
  if (phone.length !== 9) return bladJson('Podaj dziewięciocyfrowy numer telefonu.', 400)

  const kod = (cialo.kod ?? '').replace(/\D/g, '')
  // Szesc cyfr - tyle wysyla InPost i tyle waliduje referencyjny klient.
  if (kod.length !== 6) return bladJson('Kod z SMS-a ma sześć cyfr.', 400)

  let odp: Response
  try {
    odp = await fetch(`${HOST}/v1/confirmSMSCode`, {
      method: 'POST',
      headers: NAGLOWKI_INPOST,
      body: JSON.stringify(cialoPotwierdzeniaKodu(phone, kod)),
    })
  } catch (e) {
    return bladJson(`InPost nie odpowiada: ${String(e)}`, 502)
  }
  if (!odp.ok) return bladJson('Kod niepoprawny albo wygasł.', 400)

  const tokeny = (await odp.json()) as {
    authToken?: string
    refreshToken?: string
  }
  if (!tokeny.authToken || !tokeny.refreshToken) {
    return bladJson('InPost nie zwrócił tokenów - kształt odpowiedzi się zmienił.', 502)
  }

  const baza = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { error: bladZapisu } = await baza.from('inpost_connections').upsert(
    {
      member_id: czlonek.id,
      household_id: czlonek.household_id,
      phone,
      auth_token: tokeny.authToken,
      refresh_token: tokeny.refreshToken,
      status: 'aktywne',
      last_error: null,
    },
    { onConflict: 'member_id' },
  )
  if (bladZapisu) return bladJson(`Nie udało się zapisać połączenia: ${bladZapisu.message}`, 500)

  return okJson()
})
