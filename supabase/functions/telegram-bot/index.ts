import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  WSPOLNE,
  budujZapytanieBota,
  dataDlaZakresu,
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

    const { data: domownicyDb } = await baza.rpc('domownik_po_czacie', { p_chat_id: chatId })
    const domownik = domownicyDb?.[0] as Domownik | undefined

    if (!domownik) {
      await wyslijWiadomosc(
        chatId,
        'Nie znam Cię jeszcze. Połącz konto kodem z aplikacji: Mój dom → Bot na Telegramie.',
      )
      return odpowiedzOk()
    }

    const { data: szkicDb } = await baza
      .from('telegram_drafts')
      .select('event_data, created_at')
      .eq('member_id', domownik.member_id)
      .maybeSingle()

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

  const { data: udalo } = await baza.rpc('polacz_telegram', { p_kod: kod, p_chat_id: chatId })
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
    await wyslijWiadomosc(chatId, 'Napisz "tak" żeby zapisać, albo "nie" żeby anulować.')
    return
  }

  await baza.from('telegram_drafts').delete().eq('member_id', domownik.member_id)

  if (decyzja === 'nie') {
    await wyslijWiadomosc(chatId, 'OK, nie dodaję.')
    return
  }

  const czlonkowie = await pobierzCzlonkow(baza, domownik.household_id)
  const idOsoby =
    wydarzenie.czlonek === WSPOLNE
      ? []
      : [czlonkowie.get(wydarzenie.czlonek)].filter((id): id is string => Boolean(id))

  await baza.rpc('dodaj_wydarzenie_bota', {
    p_member: domownik.member_id,
    p_tytul: wydarzenie.tytul,
    p_poczatek: zlozTimestamp(wydarzenie.data, wydarzenie.calodniowe ? '00:00' : wydarzenie.start),
    p_koniec: wydarzenie.calodniowe
      ? zlozTimestamp(nastepnyDzien(wydarzenie.data), '00:00')
      : zlozTimestamp(wydarzenie.data, wydarzenie.koniec),
    p_calodniowe: wydarzenie.calodniowe,
    p_osoby: idOsoby,
  })

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

  const czlonkowie = await pobierzCzlonkow(baza, domownik.household_id)
  const imiona = [...czlonkowie.keys()]

  const zapytanie = budujZapytanieBota(new Date(), imiona, tekst)
  const wywolanie = await zapytajGeminiNarzedzie(zapytanie, kluczApi)
  const odpowiedz = rozpoznajOdpowiedz(wywolanie, imiona)

  if (odpowiedz.rodzaj === 'tekst') {
    await wyslijWiadomosc(chatId, odpowiedz.tresc)
    return
  }

  if (odpowiedz.rodzaj === 'podsumowanie') {
    const dzien = dataDlaZakresu(odpowiedz.zakres, new Date())
    const { data: dane, error } = await baza.rpc('podsumowanie_domu', {
      p_dom: domownik.household_id,
      p_dzien: dzien,
    })
    if (error) throw new Error(error.message)
    const mail = zbudujPodsumowanie(
      dane as DanePodsumowania,
      { memberId: domownik.member_id, imie: domownik.imie, email: '' },
      { pokazStopke: false },
    )
    await wyslijWiadomosc(chatId, mail.tekst)
    return
  }

  await baza.from('telegram_drafts').upsert({
    member_id: domownik.member_id,
    event_data: odpowiedz.wydarzenie,
    created_at: new Date().toISOString(),
  })
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
