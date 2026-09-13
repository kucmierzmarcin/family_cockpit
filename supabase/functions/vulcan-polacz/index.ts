import { createClient } from 'npm:@supabase/supabase-js@2'
import { Keystore } from 'npm:vulcan-api-js@3.5.4'
import { zarejestrujPrzezJwt, pobierzUczniowEdu } from '../_wspolne/vulcanApi.ts'
import { synchronizujDom } from '../_wspolne/vulcanSync.ts'

type Cialo = { apContent?: string }

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

/**
 * Wyciąga JSON z ukrytego pola `<input id="ap" ... value="...">` na stronie
 * https://eduvulcan.pl/api/ap. Weryfikacja na żywo (2026-09-13) pokazała
 * realny znacznik `<input id='ap' type='hidden' value='...' />` -
 * pojedyncze cudzysłowy i atrybut `type` MIĘDZY `id` a `value`, inaczej niż
 * pierwotnie zakładano. Dlatego: (1) najpierw wyodrębniamy cały znacznik
 * `<input ...>` zawierający `id="ap"` gdziekolwiek w nim (lookahead - nie
 * wymuszamy kolejności atrybutów), (2) dopiero w nim szukamy `value=`,
 * dopasowując wartość do TEGO SAMEGO znaku cudzysłowu, którym się zaczęła
 * (wsteczne odwołanie `\1`), żeby poprawnie obsłużyć oba warianty
 * cudzysłowu. Parsowanie przez regex, nie przez DOM - Deno nie ma
 * wbudowanego parsera HTML, a potrzebujemy tylko jednej wartości atrybutu.
 */
function wyciagnijApJson(apContent: string): Record<string, unknown> {
  const dopasowanieTagu = apContent.match(/<input\b(?=[^>]*\bid=["']ap["'])[^>]*>/i)
  const tag = dopasowanieTagu ? dopasowanieTagu[0] : apContent
  const dopasowanieWartosci = tag.match(/\bvalue=(["'])([\s\S]*?)\1/i)
  const surowyJson = dopasowanieWartosci ? dopasowanieWartosci[2] : apContent.trim()
  const odHtmlEntities = surowyJson
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
  return JSON.parse(odHtmlEntities)
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

  const { apContent } = cialo
  if (!apContent?.trim()) {
    return bladJson('Wklej zawartość strony eduvulcan.pl/api/ap.', 400)
  }

  let apJson: Record<string, unknown>
  try {
    apJson = wyciagnijApJson(apContent)
  } catch {
    return bladJson('Nie udało się odczytać wklejonej treści - upewnij się, że to cała zawartość strony /api/ap.', 400)
  }

  if (apJson.Success !== true) {
    return bladJson(`eduVULCAN zwrócił błąd: ${String(apJson.ErrorMessage ?? 'nieznany')}`, 400)
  }
  const jwty = apJson.Tokens
  if (!Array.isArray(jwty) || jwty.length === 0 || typeof jwty[0] !== 'string') {
    return bladJson('Wklejona treść nie zawiera listy Tokens - to na pewno strona /api/ap?', 400)
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

  const { data: jestRodzicem } = await klientUzytkownika.rpc('jestem_rodzicem')
  if (!jestRodzicem) return bladJson('Tylko rodzic może połączyć Vulcan.', 403)

  const { data: czlonek, error: bladCzlonka } = await klientUzytkownika
    .from('members')
    .select('id, household_id')
    .eq('user_id', uzytkownik.user.id)
    .single()
  if (bladCzlonka || !czlonek) return bladJson('Nie znaleziono domownika.', 400)

  let konta
  const keystore = new Keystore()
  try {
    await keystore.init('Kokpit Rodzinny', '')
    konta = await zarejestrujPrzezJwt(keystore, jwty as string[])
  } catch (e) {
    return bladJson(`Rejestracja w eduVULCAN nie powiodła się: ${String(e)}`, 502)
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
      account: konta,
      status: 'aktywne',
      last_error: null,
    },
    { onConflict: 'household_id' },
  )
  if (bladZapisu) return bladJson(`Nie udało się zapisać połączenia: ${bladZapisu.message}`, 500)

  let uczniowie
  try {
    uczniowie = await pobierzUczniowEdu(keystore, konta)
  } catch (e) {
    const { error: bladWycofania } = await baza
      .from('vulcan_connections')
      .delete()
      .eq('household_id', czlonek.household_id)
    if (bladWycofania) {
      console.error(
        `Nie udało się wycofać połączenia Vulcan po błędzie pobierania uczniów (dom ${czlonek.household_id}):`,
        bladWycofania.message,
      )
      return bladJson(
        `Nie udało się wczytać uczniów (${String(e)}) i nie udało się wycofać połączenia (${bladWycofania.message}) — rozłącz Vulcan i spróbuj ponownie.`,
        502,
      )
    }
    return bladJson(
      `Nie udało się wczytać uczniów: ${String(e)}. Połączenie zostało wycofane — spróbuj ponownie z nową wklejką z eduvulcan.pl/api/ap.`,
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

  void synchronizujDom(baza, czlonek.household_id).catch((e) => {
    console.error(`Wstępna synchronizacja Vulcan po rejestracji nie powiodła się (dom ${czlonek.household_id}):`, e)
  })

  return new Response(JSON.stringify({ ok: true, liczbaUczniow: wierszeUczniow.length }), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
})
