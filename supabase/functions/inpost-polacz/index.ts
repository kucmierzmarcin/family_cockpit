import { createClient } from 'npm:@supabase/supabase-js@2'

const HOST = 'https://api-inmobile-pl.easypack24.net'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Cialo = { krok?: 'sms' | 'potwierdz'; phone?: string; kod?: string }

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

  // Domownika bierzemy z JWT wolajacego, NIGDY z ciala zadania - inaczej
  // kazdy moglby podpiac swoj numer pod cudze konto. Ten sam powod, dla
  // ktorego sprawdzamy to PRZED krokiem 'sms': to zapytanie wysyla realny SMS
  // pod dowolny numer, wiec bramka logowania obowiazuje od pierwszego kroku,
  // nie dopiero przy zapisie (inaczej kazdy w internecie, majac tylko jawny
  // klucz anon, mogliby uzyc tej funkcji do bombardowania SMS-ami cudzych
  // numerow - klucz anon jest publiczny, wiec "wymagany JWT" na poziomie
  // platformy Supabase go nie zatrzyma).
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

  // Krok 1: poprosic InPost o SMS. Nic nie zapisujemy - dopoki kod nie zostanie
  // potwierdzony, nie mamy zadnego dowodu, ze numer nalezy do tej osoby.
  if (cialo.krok === 'sms') {
    const odp = await fetch(`${HOST}/v1/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone }),
    })
    if (!odp.ok) return bladJson(`InPost odrzucił prośbę o kod (HTTP ${odp.status}).`, 502)
    return okJson()
  }

  if (cialo.krok !== 'potwierdz') return bladJson('Nieznany krok.', 400)

  const kod = (cialo.kod ?? '').replace(/\D/g, '')
  if (kod.length === 0) return bladJson('Podaj kod z SMS-a.', 400)

  const odp = await fetch(`${HOST}/v1/account/verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phone, smsCode: kod }),
  })
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
