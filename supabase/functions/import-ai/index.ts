import { createClient } from 'npm:@supabase/supabase-js@2'
import { budujZapytanie, waliduj, type ZapytanieWejscie } from '../_wspolne/importAI.ts'
import { zapytajGemini } from '../_wspolne/gemini.ts'

const MAKS_ROZMIAR_PLIKU = 8 * 1024 * 1024 // bajtów po zdekodowaniu base64
const DOZWOLONE_TYPY = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') return bladJson('Tylko POST.', 405)

  let cialo: ZapytanieWejscie
  try {
    cialo = await req.json()
  } catch {
    return bladJson('Nieprawidłowy JSON.', 400)
  }

  if (!cialo.prompt?.trim() && !cialo.plik) {
    return bladJson('Podaj prompt albo plik.', 400)
  }

  if (cialo.plik) {
    if (!DOZWOLONE_TYPY.has(cialo.plik.typ_mime)) {
      return bladJson('Nieobsługiwany typ pliku - zdjęcie albo PDF.', 400)
    }
    // base64 to ~4/3 rozmiaru oryginału - to szacowanie wystarcza do odcięcia nadużyć.
    if (cialo.plik.dane_base64.length > (MAKS_ROZMIAR_PLIKU * 4) / 3) {
      return bladJson('Plik jest za duży (maks. 8 MB).', 400)
    }
  }

  const autoryzacja = req.headers.get('Authorization')
  if (!autoryzacja) return bladJson('Brak autoryzacji.', 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autoryzacja } },
  })

  const { data: uzytkownik, error: bladUzytkownika } = await supabase.auth.getUser()
  if (bladUzytkownika || !uzytkownik.user) return bladJson('Nieprawidłowa sesja.', 401)

  // RLS ("Domownicy - odczyt") ogranicza to zapytanie do domu wywołującego -
  // nie trzeba osobno ustalać household_id.
  const { data: domownicyDb, error: bladDomownikow } = await supabase.from('members').select('name')
  if (bladDomownikow) {
    return bladJson(`Nie udało się wczytać domowników: ${bladDomownikow.message}`, 500)
  }

  const kluczApi = Deno.env.get('GEMINI_API_KEY')
  if (!kluczApi) return bladJson('Brak konfiguracji GEMINI_API_KEY.', 500)

  const domownicy = (domownicyDb ?? []).map((d) => d.name)
  const dzisiaj = new Date()
  const zapytanie = budujZapytanie(dzisiaj, domownicy, cialo)

  let pozycje
  try {
    pozycje = await zapytajGemini(zapytanie, kluczApi)
    const bladWalidacji = waliduj(pozycje, domownicy, dzisiaj)
    if (bladWalidacji) return bladJson(bladWalidacji, 502)
  } catch (e) {
    return bladJson(`Nie udało się rozpoznać treści: ${(e as Error).message}`, 502)
  }

  return new Response(JSON.stringify({ pozycje }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
})
