import { createClient } from 'npm:@supabase/supabase-js@2'
import { Keystore, VulcanHebe, registerAccount } from 'npm:vulcan-api-js@3.5.4'
import { synchronizujDom } from '../_wspolne/vulcanSync.ts'

type Cialo = { token?: string; symbol?: string; pin?: string }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function bladJson(tekst: string, status: number): Response {
  return new Response(JSON.stringify({ blad: tekst }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

Deno.serve(async (req) => {
  // Formularz "Połącz" w Mój dom woła tę funkcję z przeglądarki przez
  // supabase.functions.invoke - to poprzedza preflight OPTIONS, który trzeba
  // obsłużyć samodzielnie (Deno.serve nie robi tego automatycznie).
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

  const { token, symbol, pin } = cialo
  if (!token?.trim() || !symbol?.trim() || !pin?.trim()) {
    return bladJson('Podaj Token, Symbol i PIN.', 400)
  }

  const autoryzacja = req.headers.get('Authorization')
  if (!autoryzacja) return bladJson('Brak autoryzacji.', 401)

  const klientUzytkownika = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autoryzacja } } },
  )

  const { data: uzytkownik, error: bladUzytkownika } = await klientUzytkownika.auth.getUser()
  if (bladUzytkownika || !uzytkownik.user) return bladJson('Nieprawidłowa sesja.', 401)

  // jestem_rodzicem()/moj_dom() dzialaja przez klienta z kluczem anon +
  // Authorization uzytkownika - RLS/SECURITY DEFINER same ustala kontekst.
  const { data: jestRodzicem } = await klientUzytkownika.rpc('jestem_rodzicem')
  if (!jestRodzicem) return bladJson('Tylko rodzic może połączyć Vulcan.', 403)

  const { data: czlonek, error: bladCzlonka } = await klientUzytkownika
    .from('members')
    .select('id, household_id')
    .eq('user_id', uzytkownik.user.id)
    .single()
  if (bladCzlonka || !czlonek) return bladJson('Nie znaleziono domownika.', 400)

  let konto
  const keystore = new Keystore()
  try {
    await keystore.init('Kokpit Rodzinny', '')
    konto = await registerAccount(keystore, token.trim(), symbol.trim(), pin.trim())
  } catch (e) {
    // Biblioteka rzuca wyjatki nazwane np. InvalidPINException - nazwa klasy
    // ladowala sie tylko w stringu bledu w Deno po transpilacji z Babela,
    // wiec dopasowujemy tekstem, nie instanceof.
    const tekst = String(e)
    if (/InvalidPIN/i.test(tekst)) return bladJson('Nieprawidłowy PIN.', 400)
    if (/InvalidToken|InvalidSymbol|ExpiredToken/i.test(tekst)) {
      return bladJson('Nieprawidłowy albo wygasły Token/Symbol.', 400)
    }
    return bladJson(`Rejestracja w Vulcan nie powiodła się: ${tekst}`, 502)
  }

  const baza = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const daneKeystore = keystore.dumpToObject()
  const { error: bladZapisu } = await baza.from('vulcan_connections').upsert(
    {
      household_id: czlonek.household_id,
      connected_by_member: czlonek.id,
      certificate: daneKeystore.certificate,
      fingerprint: daneKeystore.fingerprint,
      private_key: daneKeystore.privateKey,
      firebase_token: daneKeystore.firebaseToken ?? null,
      device_model: daneKeystore.deviceModel,
      account: konto,
      status: 'aktywne',
      last_error: null,
    },
    { onConflict: 'household_id' },
  )
  if (bladZapisu) return bladJson(`Nie udało się zapisać połączenia: ${bladZapisu.message}`, 500)

  let uczniowie
  try {
    const vulcan = new VulcanHebe(keystore, konto)
    uczniowie = await vulcan.getStudents()
  } catch (e) {
    // WYCOFANIE: Token/Symbol/PIN sa jednorazowe i zostaly juz zuzyte przez
    // Vulcan, wiec zostawienie wiersza `status: 'aktywne'` bez ani jednego
    // ucznia zamykaloby rodzica w stanie "jestes podlaczony, ale bez dzieci i
    // bez wyjscia" - UI pokazywaloby wtedy panel polaczonego konta zamiast
    // formularza. Kasujemy wiersz, zeby blad znaczyl po prostu "nie udalo sie,
    // sprobuj ponownie z nowym Tokenem/Symbolem/PIN-em".
    const { error: bladWycofania } = await baza
      .from('vulcan_connections')
      .delete()
      .eq('household_id', czlonek.household_id)
    if (bladWycofania) {
      console.error(
        `Nie udało się wycofać połączenia Vulcan po błędzie getStudents (dom ${czlonek.household_id}):`,
        bladWycofania.message,
      )
      return bladJson(
        `Nie udało się wczytać uczniów (${String(e)}) i nie udało się wycofać połączenia (${bladWycofania.message}) — rozłącz Vulcan i spróbuj ponownie.`,
        502,
      )
    }
    return bladJson(
      `Nie udało się wczytać uczniów: ${String(e)}. Połączenie zostało wycofane — spróbuj ponownie z nowym Tokenem, Symbolem i PIN-em.`,
      502,
    )
  }

  const wierszeUczniow = uczniowie.map((u) => ({
    household_id: czlonek.household_id,
    vulcan_id: String(u.pupil.id),
    first_name: u.pupil.firstName,
    last_name: u.pupil.surname,
    student_data: u,
  }))

  if (wierszeUczniow.length > 0) {
    const { error: bladUczniow } = await baza
      .from('vulcan_students')
      .upsert(wierszeUczniow, { onConflict: 'household_id,vulcan_id' })
    if (bladUczniow) return bladJson(`Połączono, ale nie udało się zapisać uczniów: ${bladUczniow.message}`, 500)
  }

  // Pierwsza synchronizacja od razu, zeby "Szkola" nie swiecila pustka do
  // najblizszej zaplanowanej godziny - ale dopiero PO tym, jak rodzic
  // przypisze uczniow do domownikow w kolejnym kroku UI (bez przypisania
  // synchronizujDom() i tak nikogo nie przetworzy, patrz jej filtr
  // `member_id is not null`). Wywolanie tu jest wiec nieszkodliwym no-opem
  // do czasu przypisania - zostawiamy dla przyszlych polaczen, gdzie rodzic
  // zdazy przypisac przed pierwszym zaplanowanym syncem.
  //
  // "fire-and-forget" celowo - odpowiedz HTTP nie moze czekac na pelna
  // synchronizacje. synchronizujDom() dzis zawsze rozwiazuje sie (nigdy nie
  // odrzuca) i zwraca { ok, blad } - ale to szczegol implementacji rdzenia,
  // ktory moze sie zmienic (np. przy przyszlych poprawkach synchronizujDom
  // albo bledzie sieciowym z klienta Supabase, ktory w Deno bywa rzucany, a
  // nie zwracany w polu `error`). .catch() tutaj to tania asekuracja przed
  // "unhandled promise rejection" w logach Deno - bez wplywu na odpowiedz
  // HTTP, ktora i tak zwraca sukces niezaleznie od wyniku tej wstepnej
  // synchronizacji.
  void synchronizujDom(baza, czlonek.household_id).catch((e) => {
    console.error(`Wstępna synchronizacja Vulcan po rejestracji nie powiodła się (dom ${czlonek.household_id}):`, e)
  })

  return new Response(JSON.stringify({ ok: true, liczbaUczniow: wierszeUczniow.length }), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
})
