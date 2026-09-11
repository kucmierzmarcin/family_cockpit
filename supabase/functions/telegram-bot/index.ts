import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  WSPOLNE,
  budujZapytanieBota,
  etykietaDnia,
  nastepnyDzien,
  opisPropozycji,
  rozpoznajOdpowiedz,
  rozpoznajPotwierdzenie,
  zlozTimestamp,
  type ProponowaneWydarzenie,
} from '../_wspolne/botAI.ts'
import { zapytajGeminiNarzedzie } from '../_wspolne/gemini.ts'
import { zbudujPodsumowanie, type DanePodsumowania } from '../_wspolne/podsumowanie.ts'
import { wyslijWiadomosc } from '../_wspolne/telegram.ts'

const SZKIC_WAZNY_MINUT = 10

type Domownik = { member_id: string; household_id: string; imie: string }

Deno.serve(async (req) => {
  const baza = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  let update: { message?: { chat: { id: number }; text?: string } }
  try {
    update = await req.json()
  } catch {
    return odpowiedzOk()
  }

  const wiadomosc = update.message
  if (!wiadomosc?.text) return odpowiedzOk()

  const chatId = wiadomosc.chat.id
  const tekst = wiadomosc.text.trim()

  try {
    if (tekst.startsWith('/start')) {
      await obsluzStart(baza, chatId, tekst)
      return odpowiedzOk()
    }

    const { data: domownicyDb, error: bladDomownika } = await baza.rpc('domownik_po_czacie', {
      p_chat_id: chatId,
    })
    if (bladDomownika) throw new Error(bladDomownika.message)
    const domownik = domownicyDb?.[0] as Domownik | undefined

    if (!domownik) {
      await wyslijWiadomosc(
        chatId,
        'Nie znam Cię jeszcze. Połącz konto kodem z aplikacji: Mój dom → Bot na Telegramie.',
      )
      return odpowiedzOk()
    }

    const { data: szkicDb, error: bladSzkicu } = await baza
      .from('telegram_drafts')
      .select('event_data, created_at')
      .eq('member_id', domownik.member_id)
      .maybeSingle()
    if (bladSzkicu) throw new Error(bladSzkicu.message)

    const szkicSwiezy =
      szkicDb && Date.now() - new Date(szkicDb.created_at).getTime() < SZKIC_WAZNY_MINUT * 60_000

    if (szkicSwiezy) {
      await obsluzPotwierdzenie(baza, domownik, chatId, tekst, szkicDb.event_data as ProponowaneWydarzenie)
    } else {
      await obsluzWiadomosc(baza, domownik, chatId, tekst)
    }

    return odpowiedzOk()
  } catch (e) {
    console.error(e)
    await wyslijWiadomosc(chatId, 'Coś poszło nie tak, spróbuj ponownie za chwilę.').catch(() => {})
    return odpowiedzOk()
  }
})

async function obsluzStart(
  baza: ReturnType<typeof createClient>,
  chatId: number,
  tekst: string,
): Promise<void> {
  const kod = tekst.replace('/start', '').trim()
  if (!kod) {
    await wyslijWiadomosc(chatId, 'Wyślij /start i kod z aplikacji (Mój dom → Bot na Telegramie).')
    return
  }

  const { data: udalo, error: bladParowania } = await baza.rpc('polacz_telegram', {
    p_kod: kod,
    p_chat_id: chatId,
  })
  if (bladParowania) throw new Error(bladParowania.message)
  await wyslijWiadomosc(
    chatId,
    udalo
      ? 'Połączono! Napisz np. "co mam jutro?" albo "dodaj wizytę u dentysty w piątek o 15".'
      : 'Nieprawidłowy albo wygasły kod. Wygeneruj nowy w aplikacji: Mój dom → Bot na Telegramie.',
  )
}

async function obsluzPotwierdzenie(
  baza: ReturnType<typeof createClient>,
  domownik: Domownik,
  chatId: number,
  tekst: string,
  wydarzenie: ProponowaneWydarzenie,
): Promise<void> {
  const decyzja = rozpoznajPotwierdzenie(tekst)

  if (decyzja === 'niejasne') {
    // Niejasna odpowiedz nie moze blokowac calej rozmowy na czas waznosci
    // szkicu (10 minut) - porzucamy propozycje i traktujemy wiadomosc tak,
    // jakby przyszla bez szkicu w tle.
    const { error: bladPorzucenia } = await baza
      .from('telegram_drafts')
      .delete()
      .eq('member_id', domownik.member_id)
    if (bladPorzucenia) throw new Error(bladPorzucenia.message)
    await obsluzWiadomosc(baza, domownik, chatId, tekst)
    return
  }

  if (decyzja === 'nie') {
    const { error: bladUsuniecia } = await baza
      .from('telegram_drafts')
      .delete()
      .eq('member_id', domownik.member_id)
    if (bladUsuniecia) throw new Error(bladUsuniecia.message)
    await wyslijWiadomosc(chatId, 'OK, nie dodaję.')
    return
  }

  const czlonkowie = await pobierzCzlonkow(baza, domownik.household_id)
  const idOsoby =
    wydarzenie.czlonek === WSPOLNE
      ? []
      : [czlonkowie.get(wydarzenie.czlonek)].filter((id): id is string => Boolean(id))

  const { error: bladDodania } = await baza.rpc('dodaj_wydarzenie_bota', {
    p_member: domownik.member_id,
    p_tytul: wydarzenie.tytul,
    p_poczatek: zlozTimestamp(wydarzenie.data, wydarzenie.calodniowe ? '00:00' : wydarzenie.start),
    p_koniec: wydarzenie.calodniowe
      ? zlozTimestamp(nastepnyDzien(wydarzenie.data), '00:00')
      : zlozTimestamp(wydarzenie.data, wydarzenie.koniec),
    p_calodniowe: wydarzenie.calodniowe,
    p_osoby: idOsoby,
  })
  if (bladDodania) throw new Error(bladDodania.message)

  // Kasujemy szkic dopiero PO udanym zapisie - nieudana proba (blad rzucony
  // wyzej) zostawia draft na miejscu, wiec powtorzone "tak" da sie bezpiecznie
  // ponowic. Blad samego czyszczenia nie unieważnia juz udanego zapisu -
  // logujemy, ale nie psujemy uzytkownikowi potwierdzenia sukcesu.
  const { error: bladCzyszczenia } = await baza
    .from('telegram_drafts')
    .delete()
    .eq('member_id', domownik.member_id)
  if (bladCzyszczenia) console.error(bladCzyszczenia)

  await wyslijWiadomosc(chatId, 'Dodane ✅')
}

async function obsluzWiadomosc(
  baza: ReturnType<typeof createClient>,
  domownik: Domownik,
  chatId: number,
  tekst: string,
): Promise<void> {
  const kluczApi = Deno.env.get('GEMINI_API_KEY')
  if (!kluczApi) {
    await wyslijWiadomosc(chatId, 'Bot nie jest jeszcze skonfigurowany (brak klucza Gemini).')
    return
  }

  // "Dzisiaj" musi przyjsc z bazy, w strefie Europe/Warsaw - Deno biegnie w
  // UTC, a new Date() dawal zla date w oknie 00:00-02:00 czasu warszawskiego
  // (znalezione w koncowej recenzji galezi).
  const { data: dzisiajStr, error: bladDaty } = await baza.rpc('dzisiaj_w_warszawie')
  if (bladDaty) throw new Error(bladDaty.message)
  const dzisiaj = new Date(`${dzisiajStr}T00:00:00Z`)

  const czlonkowie = await pobierzCzlonkow(baza, domownik.household_id)
  const imiona = [...czlonkowie.keys()]

  const zapytanie = budujZapytanieBota(dzisiaj, imiona, tekst)
  const wywolanie = await zapytajGeminiNarzedzie(zapytanie, kluczApi)
  const odpowiedz = rozpoznajOdpowiedz(wywolanie, imiona)

  if (odpowiedz.rodzaj === 'tekst') {
    await wyslijWiadomosc(chatId, odpowiedz.tresc)
    return
  }

  if (odpowiedz.rodzaj === 'podsumowanie') {
    const { data: dane, error } = await baza.rpc('podsumowanie_domu', {
      p_dom: domownik.household_id,
      p_dzien: odpowiedz.data,
    })
    if (error) throw new Error(error.message)
    const mail = zbudujPodsumowanie(
      dane as DanePodsumowania,
      { memberId: domownik.member_id, imie: domownik.imie, email: '' },
      {
        pokazStopke: false,
        etykietaKalendarza: etykietaDnia(odpowiedz.data, dzisiaj),
      },
    )
    await wyslijWiadomosc(chatId, mail.tekst)
    return
  }

  const { error: bladSzkicu } = await baza.from('telegram_drafts').upsert({
    member_id: domownik.member_id,
    event_data: odpowiedz.wydarzenie,
    created_at: new Date().toISOString(),
  })
  if (bladSzkicu) throw new Error(bladSzkicu.message)
  await wyslijWiadomosc(chatId, `Zapisać: ${opisPropozycji(odpowiedz.wydarzenie)}? (tak/nie)`)
}

async function pobierzCzlonkow(
  baza: ReturnType<typeof createClient>,
  householdId: string,
): Promise<Map<string, string>> {
  const { data } = await baza.from('members').select('id, name').eq('household_id', householdId)
  return new Map((data ?? []).map((c: { id: string; name: string }) => [c.name, c.id]))
}

function odpowiedzOk(): Response {
  return new Response('ok', { status: 200 })
}
