import { createClient } from 'npm:@supabase/supabase-js@2'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { naWierszePaczek } from '../_wspolne/inpostApi.ts'

const HOST = 'https://api-inmobile-pl.easypack24.net'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Polaczenie = {
  member_id: string
  household_id: string
  auth_token: string
  refresh_token: string
}

function odpowiedz(tresc: unknown, status = 200): Response {
  return new Response(JSON.stringify(tresc), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

/**
 * Czy to wywołanie z pg_cron (klucz service_role), czy z przeglądarki (JWT
 * domownika klikającego "Odśwież teraz" w zakładce Paczki)?
 *
 * Dokładnie ten sam mechanizm co `jestWywolaniemSerwisowym` w
 * `vulcan-sync/index.ts` (patrz komentarz tam po pełne uzasadnienie): rolę
 * czytamy z ładunku już zweryfikowanego przez bramkę Supabase (`verify_jwt:
 * true` dla tej funkcji) tokenu, a nie przez porównanie ze stringiem z env -
 * bo `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` po migracji API keys może
 * być w innym formacie niż legacy JWT, którym pg_cron faktycznie się
 * przedstawia.
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

/**
 * Synchronizuje jedną listę połączeń (wszystkie aktywne domy - cron, albo
 * tylko jeden dom - przycisk "Odśwież teraz"). Padnięta sesja JEDNEGO
 * domownika nie może zatrzymać synchronizacji pozostałych, więc każde
 * połączenie ma własny try/catch.
 */
async function synchronizujPolaczenia(baza: SupabaseClient, polaczenia: Polaczenie[]): Promise<number> {
  let zsynchronizowane = 0

  for (const p of polaczenia) {
    try {
      // Odświeżamy token bezwarunkowo przy każdym przebiegu (co 30 minut wg
      // crona w schema.sql): jest tani, a InPost (nieoficjalne API) nigdzie
      // nie mówi wprost, kiedy stary authToken przestanie działać. Kolumna
      // `token_expires_at` w schemacie CELOWO zostaje nieużywana - to samo
      // ustalono już przy `inpost-polacz` (Zadanie 3): odpowiedź weryfikacji
      // kodu SMS nie zwraca żadnej informacji o wygaśnięciu, a zgadywanie
      // nazwy/kształtu pola w odpowiedzi `/v1/authenticate` bez żywego zrzutu
      // groziłoby cichym zepsuciem (błędnie sparsowana data wygaśnięcia
      // mogłaby permanentnie wstrzymać odświeżanie, co jest gorsze niż jeden
      // dodatkowy request na pół godziny).
      const odswiez = await fetch(`${HOST}/v1/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: p.refresh_token, phoneOS: 'Android' }),
      })

      if (!odswiez.ok) {
        // Padnieta sesja to STATUS, nie wyjatek - jeden domownik nie moze
        // zatrzymac synchronizacji pozostalych.
        await baza
          .from('inpost_connections')
          .update({
            status: 'wymaga_ponownego_logowania',
            last_error: `Odświeżenie sesji nie powiodło się (HTTP ${odswiez.status}).`,
          })
          .eq('member_id', p.member_id)
        continue
      }

      const { authToken, refreshToken } = (await odswiez.json()) as {
        authToken: string
        refreshToken?: string
      }

      await baza
        .from('inpost_connections')
        .update({
          auth_token: authToken,
          refresh_token: refreshToken ?? p.refresh_token,
          last_error: null,
        })
        .eq('member_id', p.member_id)

      const odp = await fetch(`${HOST}/v4/parcels/tracked`, {
        headers: { Authorization: authToken },
      })
      if (!odp.ok) throw new Error(`Pobranie paczek nie powiodło się (HTTP ${odp.status}).`)

      const wiersze = naWierszePaczek(await odp.json())

      if (wiersze.length > 0) {
        await baza.from('inpost_parcels').upsert(
          wiersze.map((w) => ({
            ...w,
            member_id: p.member_id,
            household_id: p.household_id,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'member_id,shipment_number' },
        )
      }

      // Stan biezacy, nie historia: co znika z API, znika z tabeli. `.notIn`
      // zamiast recznego `.not('shipment_number', 'in', \`(${...})\`)` - ten
      // drugi wklejal numery przesylek WPROST jako tekst filtra PostgREST:
      // dzis dziala, bo numery sa cyfrowe, ale kruche (przecinek/nawias w
      // numerze rozjechalby filtr). `.notIn()` z supabase-js buduje ten sam
      // filtr, ale cudzyslowuje kazda wartosc zawierajaca zarezerwowany znak
      // PostgREST - bezpieczne bez wzgledu na to, co kiedykolwiek wpadnie w
      // shipment_number.
      const zostaja = wiersze.map((w) => w.shipment_number)
      const usun = baza.from('inpost_parcels').delete().eq('member_id', p.member_id)
      await (zostaja.length > 0 ? usun.notIn('shipment_number', zostaja) : usun)

      zsynchronizowane++
    } catch (e) {
      await baza
        .from('inpost_connections')
        .update({ last_error: e instanceof Error ? e.message : String(e) })
        .eq('member_id', p.member_id)
    }
  }

  return zsynchronizowane
}

Deno.serve(async (req) => {
  // Przycisk "Odśwież teraz" (Zadanie 8) woła tę funkcję z przeglądarki przez
  // supabase.functions.invoke - to poprzedza preflight OPTIONS, który trzeba
  // obsłużyć samodzielnie (Deno.serve nie robi tego automatycznie).
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const baza = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const autoryzacja = req.headers.get('Authorization') ?? ''

  // Rola z tokenu rozróżnia "zsynchronizuj wszystkie aktywne połączenia"
  // (cron, klucz service_role) od "zsynchronizuj MÓJ dom teraz" (przycisk w
  // zakładce Paczki, zwykły JWT domownika) - dokładnie ten sam podział co w
  // `vulcan-sync/index.ts`. Bez niego kliknięcie przycisku przez JEDNEGO
  // domownika jednego domu synchronizowałoby połączenia WSZYSTKICH domów w
  // całej instalacji (to wieloużytkownikowa apka - patrz `zaloz_dom`): cudze
  // tokeny sesji odświeżane bez wiedzy właściciela, cudzy `last_error`
  // nadpisywany, a przy pechowym zbiegu w czasie z prawdziwym cronem - wyścig
  // o jednorazowy `refresh_token` tego samego połączenia mógłby fałszywie
  // oznaczyć działającą sesję jako nieważną.
  let polaczenia: Polaczenie[]

  if (jestWywolaniemSerwisowym(autoryzacja)) {
    const { data, error } = await baza
      .from('inpost_connections')
      .select('member_id, household_id, auth_token, refresh_token')
      .eq('status', 'aktywne')
    if (error) return odpowiedz({ blad: error.message }, 500)
    polaczenia = (data ?? []) as Polaczenie[]
  } else {
    const klientUzytkownika = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: autoryzacja } } },
    )

    const { data: uzytkownik } = await klientUzytkownika.auth.getUser()
    if (!uzytkownik.user) return odpowiedz({ blad: 'Nieprawidłowa sesja.' }, 401)

    const { data: czlonek } = await baza
      .from('members')
      .select('household_id')
      .eq('user_id', uzytkownik.user.id)
      .single()
    if (!czlonek) return odpowiedz({ blad: 'Nie znaleziono domownika.' }, 400)

    const { data, error } = await baza
      .from('inpost_connections')
      .select('member_id, household_id, auth_token, refresh_token')
      .eq('status', 'aktywne')
      .eq('household_id', czlonek.household_id)
    if (error) return odpowiedz({ blad: error.message }, 500)
    polaczenia = (data ?? []) as Polaczenie[]
  }

  const zsynchronizowane = await synchronizujPolaczenia(baza, polaczenia)
  return odpowiedz({ zsynchronizowane })
})
