import { createClient } from 'npm:@supabase/supabase-js@2'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  naWierszePaczek,
  rozpoznanyKsztaltOdpowiedzi,
  statusyNierozpoznane,
  zawieraNierozpoznanyStatus,
} from '../_wspolne/inpostApi.ts'
import { jestWywolaniemSerwisowym } from '../_wspolne/autoryzacjaSerwisowa.ts'

const HOST = 'https://api-inmobile-pl.easypack24.net'

// Naglowki 1:1 jak w `ha-parcel-integrations/ha-inpost` (potwierdzone na
// zywym koncie 2026-08-15) - patrz `inpost-polacz/index.ts`. Wczesniej te
// dwa wywolania (odswiezenie tokenu, pobranie paczek) nie mialy ZADNEGO
// User-Agenta - jesli InPost/Cloudflare rozpoznaje klienta wlasnie po tym
// naglowku, byla to osobna przyczyna cichych awarii synchronizacji.
const NAGLOWKI_INPOST = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': 'InPost-Mobile/3.27.2 (Android 14; SDK 34) okhttp/4.11.0',
  'X-Api-Version': '1',
}

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
        headers: NAGLOWKI_INPOST,
        body: JSON.stringify({ refreshToken: p.refresh_token, phoneOS: 'Android' }),
      })

      if (!odswiez.ok) {
        // Padnieta sesja to STATUS, nie wyjatek - jeden domownik nie moze
        // zatrzymac synchronizacji pozostalych.
        const { error: bladZapisuStatusu } = await baza
          .from('inpost_connections')
          .update({
            status: 'wymaga_ponownego_logowania',
            last_error: `Odświeżenie sesji nie powiodło się (HTTP ${odswiez.status}).`,
          })
          .eq('member_id', p.member_id)
        if (bladZapisuStatusu) {
          console.error(
            `Nie udalo sie zapisac statusu "wymaga_ponownego_logowania" dla polaczenia ${p.member_id}: ${bladZapisuStatusu.message}`,
          )
        }
        continue
      }

      const { authToken, refreshToken } = (await odswiez.json()) as {
        authToken: string
        refreshToken?: string
      }

      // supabase-js NIE rzuca wyjatkiem przy bledzie zapytania - zwraca
      // { data, error }. Trzeba sprawdzic `error` jawnie, inaczej cichy blad
      // zapisu tokenu przechodzi dalej niezauwazony: kolejny przebieg uzylby
      // wtedy starego (juz zuzytego u InPostu, jednorazowego) refresh_tokena
      // i falszywie oznaczylby dzialajaca sesje jako niewazna.
      const { error: bladZapisuTokenu } = await baza
        .from('inpost_connections')
        .update({
          auth_token: authToken,
          refresh_token: refreshToken ?? p.refresh_token,
          last_error: null,
        })
        .eq('member_id', p.member_id)
      if (bladZapisuTokenu) {
        throw new Error(`Zapis odświeżonego tokenu nie powiódł się: ${bladZapisuTokenu.message}`)
      }

      // `cache: 'no-store'` jest konieczne - bez niego Deno potrafi zwrocic
      // `304 Not Modified` (puste cialo) zamiast prawdziwej listy paczek,
      // najwyrazniej wykorzystujac wspoldzielony cache fetch() z rozgrzanego
      // izolatu - zywo potwierdzone 2026-09-18, pierwsze prawdziwe wywolanie
      // po udanym parowaniu dostalo 304 zamiast 200.
      const odp = await fetch(`${HOST}/v3/parcels/tracked`, {
        headers: { ...NAGLOWKI_INPOST, Authorization: authToken },
        cache: 'no-store',
      })
      if (!odp.ok) throw new Error(`Pobranie paczek nie powiodło się (HTTP ${odp.status}).`)

      const surowaOdpowiedz = await odp.json()

      // `naWierszePaczek` zwraca `[]` zarowno dla "naprawde nic nie czeka",
      // jak i dla "ksztalt odpowiedzi sie nie zgadza" (pole `parcels`
      // zniknelo/zmienilo nazwe) - te dwie sytuacje NIE wolno pomylic, bo
      // nizej kasujemy z tabeli wszystko, czego nie ma na liscie "zostaja".
      // Cicha zmiana ksztaltu API skutkowalaby wtedy wyczyszczeniem
      // WSZYSTKICH realnie czekajacych paczek kazdemu domownikowi, bez
      // jednego bledu w logach - dokladnie ten wzorzec cichego bledu, ktory
      // w Vulcanie zlapal rozjazd `Lesson.date`/`DateAt`. Rzucamy wiec
      // wyjatek PRZED jakimkolwiek zapisem/kasowaniem, gdy ksztaltu nie da
      // sie rozpoznac - to zostawia stare dane w tabeli nietkniete i widoczny
      // `last_error`, zamiast cichego wyczyszczenia.
      if (!rozpoznanyKsztaltOdpowiedzi(surowaOdpowiedz)) {
        throw new Error(
          'Nierozpoznany ksztalt odpowiedzi API paczek (pole "parcels" nie jest tablica) - InPost mogl zmienic API.',
        )
      }

      const wiersze = naWierszePaczek(surowaOdpowiedz)

      // Drugi sygnal, subtelniejszy niz "parcels" znika: w odpowiedzi
      // wystepuje status, ktorego nie ma ANI na liscie "czeka na odbior"
      // (`STATUSY_DO_ODBIORU`), ANI na liscie stanow koncowych
      // (`STATUSY_KONCOWE`) - czyli napis, jakiego jeszcze nie widzielismy
      // (np. InPost zmienil "Gotowa do odbioru" na "Gotowa do odbioru 24/7").
      // Rozpoznany status koncowy (np. "Doreczona") to NORMALNA praca API -
      // domownik, ktory ma w danej chwili same odebrane/zwrocone paczki,
      // NIE jest sygnalem awarii, wiec nie wywraca synchronizacji. Dopiero
      // status spoza obu list jest podejrzany - w tym przypadku (w
      // odroznieniu od legalnego "wszystko rozpoznane") NIE kasujemy nic,
      // tylko zglaszamy podejrzenie.
      if (zawieraNierozpoznanyStatus(surowaOdpowiedz)) {
        const statusy = statusyNierozpoznane(surowaOdpowiedz)
        console.warn(
          `Polaczenie ${p.member_id}: API InPost zwrocilo status spoza znanych list - ` +
            `mozliwa zmiana napisu statusu. Nierozpoznane statusy: ${statusy.join(', ') || 'brak'}.`,
        )
        throw new Error(
          `Nierozpoznane statusy paczek (InPost mogl zmienic napisy statusow) - pominieto kasowanie. ` +
            `Statusy w odpowiedzi: ${statusy.join(', ') || 'brak'}.`,
        )
      }

      if (wiersze.length > 0) {
        const { error: bladZapisuPaczek } = await baza.from('inpost_parcels').upsert(
          wiersze.map((w) => ({
            ...w,
            member_id: p.member_id,
            household_id: p.household_id,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'member_id,shipment_number' },
        )
        // Nie kasujemy nizej, jesli ten zapis sie nie udal - inaczej
        // usunelibysmy z tabeli paczki, ktorych swiezo NIE zapisalismy.
        if (bladZapisuPaczek) {
          throw new Error(`Zapis paczek nie powiódł się: ${bladZapisuPaczek.message}`)
        }
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
      const { error: bladKasowania } = await (zostaja.length > 0
        ? usun.notIn('shipment_number', zostaja)
        : usun)
      if (bladKasowania) {
        throw new Error(`Czyszczenie nieaktualnych paczek nie powiodło się: ${bladKasowania.message}`)
      }

      zsynchronizowane++
    } catch (e) {
      const tekstBledu = e instanceof Error ? e.message : String(e)
      // Logujemy WYLACZNIE nasz wlasny, skonstruowany komunikat bledu -
      // NIGDY surowej odpowiedzi API, ktora moze zawierac `openCode`.
      console.error(`Synchronizacja polaczenia ${p.member_id} nie powiodla sie: ${tekstBledu}`)
      const { error: bladZapisuBledu } = await baza
        .from('inpost_connections')
        .update({ last_error: tekstBledu })
        .eq('member_id', p.member_id)
      if (bladZapisuBledu) {
        console.error(
          `Dodatkowo nie udalo sie zapisac last_error dla polaczenia ${p.member_id}: ${bladZapisuBledu.message}`,
        )
      }
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
