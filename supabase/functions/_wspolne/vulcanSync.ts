import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Student } from 'npm:vulcan-api-js@3.5.4'
import { zbudujVulcanHebe, type WierszPolaczenia } from './vulcanApi.ts'

type WierszUcznia = { id: string; student_data: unknown }
type WynikSync = { ok: boolean; blad?: string }

function poczatekTygodnia(d: Date): Date {
  const kopia = new Date(d)
  const dzien = (kopia.getDay() + 6) % 7 // 0 = poniedziałek
  kopia.setDate(kopia.getDate() - dzien)
  kopia.setHours(0, 0, 0, 0)
  return kopia
}

function koniecTygodnia(poczatek: Date): Date {
  const kopia = new Date(poczatek)
  kopia.setDate(kopia.getDate() + 7)
  return kopia
}

/** 'RRRR-MM-DD' w czasie lokalnym - tak samo jak `klucz()` w aplikacji, żeby
 * przedział tygodnia nie przesunął się o dzień przez strefę czasową. */
function dataIso(d: Date): string {
  const rok = d.getFullYear()
  const miesiac = String(d.getMonth() + 1).padStart(2, '0')
  const dzien = String(d.getDate()).padStart(2, '0')
  return `${rok}-${miesiac}-${dzien}`
}

/**
 * Zostawia dla każdego klucza konfliktu tylko OSTATNI wiersz z tablicy.
 *
 * Postgres rzuca `ON CONFLICT DO UPDATE command cannot affect row a second
 * time`, gdy jedna tablica przekazana do `.upsert()` zawiera dwa wiersze o tym
 * samym kluczu konfliktu - a Vulcan realnie takie duplikaty potrafi zwrócić
 * (dwie zmiany w tym samym slocie planu, ta sama wiadomość z dwóch skrzynek).
 * "Ostatni wygrywa" jest tu celowe: łączymy plan lekcji ze zmianami w tej
 * kolejności, więc zmiana nadal nadpisuje zwykłą lekcję.
 */
function bezDuplikatow<T>(wiersze: T[], klucz: (w: T) => string): T[] {
  const mapa = new Map<string, T>()
  for (const w of wiersze) mapa.set(klucz(w), w)
  return Array.from(mapa.values())
}

/** Tekst wyjątku - tylko `e.message` prawdziwego Error, żeby `String(e)` na
 * rzuconym nie-Errorze nie dał mylącego "[object Object]". */
function tekstBledu(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Zamienia wyjątek z synchronizacji na wynik. Błąd sesji (certyfikat/token
 * nieważny) dodatkowo ustawia `status = 'wymaga_ponownej_rejestracji'` -
 * reszta synchronizacji i tak by się nie udała bez ważnych poświadczeń.
 */
async function bladSynchronizacji(
  baza: SupabaseClient,
  householdId: string,
  e: unknown,
  kontekst: string,
): Promise<WynikSync> {
  const tekst = tekstBledu(e)
  // Biblioteka vulcan-api-js nie eksponuje własnych klas wyjątków ani kodu
  // HTTP (sprawdzone w publikowanym bundlu - same generyczne `Error`), więc
  // nie da się rozróżnić "sesja nieważna" po `e.constructor.name`. Dopasowanie
  // po nazwach z treści błędu to świadomy kompromis: `\b...\b` ogranicza
  // trafienia do całych słów (nie fragmentów innych identyfikatorów), co
  // zmniejsza ryzyko fałszywego trafienia w nieznanym, nieprzewidzianym
  // komunikacie błędu. Błędna klasyfikacja tutaj nie gubi danych - w
  // najgorszym razie wymusza ręczną ponowną rejestrację, którą da się
  // doprecyzować po zobaczeniu prawdziwych błędów z logów (Zadanie 5/8).
  const sesjaNiewazna = /\b(Unauthorized|ExpiredToken|InvalidSignature)\b/i.test(tekst)
  if (sesjaNiewazna) {
    const { error: bladAktualizacjiStatusu } = await baza
      .from('vulcan_connections')
      .update({ status: 'wymaga_ponownej_rejestracji', last_error: tekst })
      .eq('household_id', householdId)
    if (bladAktualizacjiStatusu) {
      return {
        ok: false,
        blad: `Sesja Vulcan wygasła (dodatkowo nie udało się zapisać statusu: ${bladAktualizacjiStatusu.message}): ${tekst}`,
      }
    }
    return { ok: false, blad: `Sesja Vulcan wygasła: ${tekst}` }
  }
  return { ok: false, blad: `${kontekst}: ${tekst}` }
}

/**
 * Synchronizuje jeden dom: dla każdego przypisanego ucznia pobiera plan
 * lekcji, zmiany, sprawdziany i zadania domowe, a raz na cały dom - wiadomości
 * (skrzynki należą do konta RODZICA, nie do dziecka). Współdzielona przez
 * `vulcan-sync` (cron, wiele domów) i `vulcan-polacz` (pierwsza
 * synchronizacja od razu po rejestracji).
 */
export async function synchronizujDom(
  baza: SupabaseClient,
  householdId: string,
): Promise<WynikSync> {
  const { data: polaczenie, error: bladPolaczenia } = await baza
    .from('vulcan_connections')
    .select('*')
    .eq('household_id', householdId)
    .single()

  if (bladPolaczenia || !polaczenie) {
    return { ok: false, blad: `Brak połączenia z Vulcan: ${bladPolaczenia?.message ?? 'nie znaleziono'}` }
  }

  const { data: uczniowie, error: bladUczniow } = await baza
    .from('vulcan_students')
    .select('id, student_data')
    .eq('household_id', householdId)
    .not('member_id', 'is', null)
    .order('id')

  if (bladUczniow) {
    return { ok: false, blad: `Nie udało się wczytać uczniów: ${bladUczniow.message}` }
  }

  const listaUczniow = (uczniowie ?? []) as WierszUcznia[]
  const poczatek = poczatekTygodnia(new Date())
  const koniec = koniecTygodnia(poczatek)
  // Błędy pominiętych uczniów (patrz `continue` niżej) - zebrane, żeby wynik
  // funkcji uczciwie odzwierciedlał częściowe niepowodzenie zamiast cichego
  // `{ok:true}` z zerem zapisanych wierszy dla pominiętych uczniów.
  const bledyUczniow: string[] = []

  for (const uczen of listaUczniow) {
    // Świeży klient na każdego ucznia: `Api.setStudent()` w bibliotece
    // DOKLEJA symbol jednostki do `restUrl` przy każdym wywołaniu, więc
    // ponowne `selectStudent()` na tym samym kliencie zbudowałoby ścieżkę
    // `.../jednostkaA/jednostkaB/`. Budowa klienta jest lokalna (bez sieci),
    // więc to tanie.
    let vulcan
    try {
      const daneUcznia = uczen.student_data as { __restUrl?: string }
      if (!daneUcznia.__restUrl) {
        const opis = `Brak zapisanego adresu REST dla ucznia ${uczen.id} - połącz Vulcan ponownie.`
        console.error(`Pomijam ucznia ${uczen.id} w tej synchronizacji: ${opis}`)
        bledyUczniow.push(opis)
        continue
      }
      vulcan = await zbudujVulcanHebe(polaczenie as WierszPolaczenia, daneUcznia.__restUrl)
      await vulcan.selectStudent(uczen.student_data as Student)
    } catch (e) {
      // Błąd JEDNEGO ucznia (np. brak Periods w danych z eduVULCAN - patrz
      // łatka w pobierzUczniowEdu) nie powinien przerywać synchronizacji
      // rodzeństwa, które mogłoby się udać. Wyjątek: utrata sesji dotyczy
      // całego połączenia, więc tam nadal przerywamy i zgłaszamy od razu.
      const wynik = await bladSynchronizacji(baza, householdId, e, `Nie udało się zbudować klienta Vulcan dla ucznia ${uczen.id}`)
      if (wynik.blad?.startsWith('Sesja Vulcan wygasła')) return wynik
      console.error(`Pomijam ucznia ${uczen.id} w tej synchronizacji: ${wynik.blad}`)
      if (wynik.blad) bledyUczniow.push(wynik.blad)
      continue
    }

    try {
      const lekcje = await vulcan.getLessons(poczatek, koniec)
      const zmiany = await vulcan.getChangedLessons(poczatek, koniec)

      const lekcjePrzefiltrowane = lekcje.filter((l) => l.date?.date && l.timeSlot?.start && l.timeSlot?.end)
      if (lekcje.length > 0 && lekcjePrzefiltrowane.length === 0) {
        // To DOKŁADNIE ten wzorzec cichego błędu, który ukrywał problem z
        // Lesson.date/DateAt przez dwie rundy diagnozy na żywo - zostaje jako
        // stały alarm na wypadek, gdyby eduVULCAN znów zmienił nazwę pola.
        console.error(
          `Ostrzeżenie: ${lekcje.length} lekcji dla ucznia ${uczen.id} odrzuconych przez filtr daty/godzin - możliwy brak/inna nazwa pola.`,
        )
      }
      const wierszeLekcji = lekcjePrzefiltrowane
        .map((l) => ({
          student_id: uczen.id,
          household_id: householdId,
          lesson_date: l.date!.date,
          start_time: l.timeSlot!.start,
          end_time: l.timeSlot!.end,
          subject: l.subject?.name ?? l.event ?? '(brak przedmiotu)',
          teacher: l.teacherPrimary?.displayName ?? null,
          room: l.room?.code ?? null,
          changed: false,
          change_note: null as string | null,
        }))

      // Zmiany NADPISUJĄ zwykłą lekcję w tym samym slocie (ten sam klucz
      // unikalności student_id+lesson_date+start_time), dlatego lądują w
      // scalonej tablicy PO zwykłych lekcjach - `bezDuplikatow` zostawia
      // ostatni wiersz, czyli zmianę.
      const zmianyPrzefiltrowane = zmiany.filter((z) => z.lessonDate?.date && z.time?.start && z.time?.end)
      if (zmiany.length > 0 && zmianyPrzefiltrowane.length === 0) {
        // Ten sam wzorzec cichego bledu, ktory ukrywal Lesson.date przez dwie
        // rundy diagnozy na zywo (eduVULCAN potrafi nazwac pole daty inaczej,
        // niz zaklada biblioteka) - tu nie mamy jeszcze dowodu na konkretna
        // przyczyne, wiec tylko ostrzegamy zamiast zgadywac poprawke.
        console.error(
          `Ostrzeżenie: ${zmiany.length} zmian planu dla ucznia ${uczen.id} odrzuconych przez filtr daty/godzin - możliwy brak/inna nazwa pola.`,
        )
      }
      const wierszeZmian = zmianyPrzefiltrowane
        .map((z) => ({
          student_id: uczen.id,
          household_id: householdId,
          lesson_date: z.lessonDate!.date,
          start_time: z.time!.start,
          end_time: z.time!.end,
          subject: z.subject?.name ?? z.event ?? '(zmiana planu)',
          teacher: z.teacher?.displayName ?? null,
          room: z.room?.code ?? null,
          changed: true,
          change_note: (z.note ?? z.reason ?? z.event ?? null) as string | null,
        }))

      const wierszePlanu = bezDuplikatow(
        [...wierszeLekcji, ...wierszeZmian],
        (w) => `${w.student_id}|${w.lesson_date}|${w.start_time}`,
      )

      // Najpierw kasujemy cały bieżący tydzień tego ucznia, dopiero potem
      // wstawiamy nowy plan. Sam upsert zostawiłby na zawsze lekcje USUNIĘTE
      // z planu w Vulcan (nic ich nigdy nie nadpisze), więc "bieżący tydzień"
      // z czasem przestawałby być prawdą.
      const { error: bladKasowania } = await baza
        .from('vulcan_lessons')
        .delete()
        .eq('student_id', uczen.id)
        .gte('lesson_date', dataIso(poczatek))
        .lt('lesson_date', dataIso(koniec))
      if (bladKasowania) {
        throw new Error(`Czyszczenie planu lekcji nie powiodło się: ${bladKasowania.message}`)
      }

      if (wierszePlanu.length > 0) {
        const { error: bladZapisu } = await baza
          .from('vulcan_lessons')
          .upsert(wierszePlanu, { onConflict: 'student_id,lesson_date,start_time' })
        if (bladZapisu) throw new Error(`Zapis planu lekcji nie powiódł się: ${bladZapisu.message}`)
      }

      const sprawdziany = await vulcan.getExams()
      const sprawdzianyPrzefiltrowane = sprawdziany.filter((e) => e.deadline?.date)
      if (sprawdziany.length > 0 && sprawdzianyPrzefiltrowane.length === 0) {
        console.error(
          `Ostrzeżenie: ${sprawdziany.length} sprawdzianów dla ucznia ${uczen.id} odrzuconych przez filtr terminu - możliwy brak/inna nazwa pola.`,
        )
      }
      const wierszeSprawdzianow = bezDuplikatow(
        sprawdzianyPrzefiltrowane
          .map((e) => ({
            student_id: uczen.id,
            household_id: householdId,
            kind: 'sprawdzian' as const,
            due_date: e.deadline!.date,
            subject: e.subject?.name ?? '(brak przedmiotu)',
            description: e.topic ?? null,
            vulcan_key: e.key,
          })),
        (w) => `${w.student_id}|${w.kind}|${w.vulcan_key}`,
      )
      if (wierszeSprawdzianow.length > 0) {
        const { error: bladZapisu } = await baza
          .from('vulcan_assignments')
          .upsert(wierszeSprawdzianow, { onConflict: 'student_id,kind,vulcan_key' })
        if (bladZapisu) throw new Error(`Zapis sprawdzianów nie powiódł się: ${bladZapisu.message}`)
      }

      const zadania = await vulcan.getHomework()
      const zadaniaPrzefiltrowane = (zadania as Array<Record<string, unknown>>).filter((z) => z.deadline)
      if (zadania.length > 0 && zadaniaPrzefiltrowane.length === 0) {
        console.error(
          `Ostrzeżenie: ${zadania.length} zadań domowych dla ucznia ${uczen.id} odrzuconych przez filtr terminu - możliwy brak/inna nazwa pola.`,
        )
      }
      const wierszeZadan = bezDuplikatow(
        zadaniaPrzefiltrowane
          .map((z) => ({
            student_id: uczen.id,
            household_id: householdId,
            kind: 'zadanie_domowe' as const,
            due_date: new Date(z.deadline as string | number | Date).toISOString().slice(0, 10),
            subject: (z.subject as { name?: string } | undefined)?.name ?? '(brak przedmiotu)',
            description: (z.content as string | undefined) ?? null,
            vulcan_key: String(z.key),
          })),
        (w) => `${w.student_id}|${w.kind}|${w.vulcan_key}`,
      )
      if (wierszeZadan.length > 0) {
        const { error: bladZapisu } = await baza
          .from('vulcan_assignments')
          .upsert(wierszeZadan, { onConflict: 'student_id,kind,vulcan_key' })
        if (bladZapisu) throw new Error(`Zapis zadań domowych nie powiódł się: ${bladZapisu.message}`)
      }
    } catch (e) {
      // Tak samo jak przy budowie klienta wyżej: błąd JEDNEGO ucznia (np.
      // brak Periods -> `Api.setStudent` ustawia `period=undefined` ->
      // kolejne wywołanie rzuca przy budowaniu zapytania) nie przerywa
      // synchronizacji rodzeństwa. Sesja wygasła nadal przerywa od razu.
      const wynik = await bladSynchronizacji(baza, householdId, e, `Błąd synchronizacji ucznia ${uczen.id}`)
      if (wynik.blad?.startsWith('Sesja Vulcan wygasła')) return wynik
      console.error(`Pomijam ucznia ${uczen.id} w tej synchronizacji: ${wynik.blad}`)
      if (wynik.blad) bledyUczniow.push(wynik.blad)
      continue
    }
  }

  // Co najmniej jeden uczeń pominięty - nie zgłaszamy fałszywego sukcesu.
  // Dane uczniów, którzy się udali, już są zapisane (zapis dzieje się w
  // pętli, per uczeń) - to jest ostrzeżenie o CZĘŚCIOWYM niepowodzeniu, nie
  // cofnięcie tego, co się udało.
  if (bledyUczniow.length > 0) {
    return { ok: false, blad: `Nie udało się zsynchronizować ${bledyUczniow.length} z ${listaUczniow.length} uczniów: ${bledyUczniow.join(' | ')}` }
  }

  const wynikWiadomosci = await synchronizujWiadomosci(baza, householdId, polaczenie as WierszPolaczenia, listaUczniow)
  if (!wynikWiadomosci.ok) {
    // Sesja wygasła jest wspólna dla całego połączenia (nie tylko wiadomości)
    // - to trzeba zgłosić, bo bez ponownej rejestracji reszta synchronizacji
    // i tak by się nie udała. Każdy INNY błąd wiadomości jest drugorzędny
    // względem planu lekcji/zadań, który w tym miejscu już się poprawnie
    // zapisał - nie cofamy tego sukcesu z powodu wiadomości (zostaje jako
    // dodatkowe zabezpieczenie, mimo że główna przyczyna - brak pola Status
    // w odpowiedzi eduVULCAN dla skrzynek - jest już naprawiona w
    // `zbudujVulcanHebe`/`zlagodzBrakStatusu`).
    const sesjaNiewazna = wynikWiadomosci.blad?.startsWith('Sesja Vulcan wygasła')
    if (sesjaNiewazna) return wynikWiadomosci
    console.error(`Synchronizacja wiadomości nie powiodła się dla domu ${householdId}: ${wynikWiadomosci.blad}`)
  }

  const { error: bladCzyszczeniaBledu } = await baza
    .from('vulcan_connections')
    .update({ last_error: null })
    .eq('household_id', householdId)
  if (bladCzyszczeniaBledu) {
    return { ok: false, blad: `Nie udało się zaktualizować statusu połączenia: ${bladCzyszczeniaBledu.message}` }
  }
  return { ok: true }
}

/**
 * Wiadomości - RAZ NA DOM, nie raz na ucznia.
 *
 * Skrzynki wiadomości należą do konta RODZICA, a nie do konkretnego dziecka,
 * więc pobieranie ich w pętli po uczniach zapisywało każdą wiadomość tyle
 * razy, ilu jest przypisanych uczniów. Zapisujemy je pod pierwszym (wg id)
 * przypisanym uczniem - kolumna `vulcan_messages.student_id` jest NOT NULL i
 * to ona domyka klucz unikalności - a zakładka „Wiadomości" w Szkole pokazuje
 * je dla całego domu, niezależnie od wybranego dziecka. Wiersze przypięte do
 * pozostałych uczniów kasujemy, żeby po zmianie przypisań nie zostały
 * duplikaty ze starych synchronizacji.
 *
 * Kierunek wiadomości (odebrane/wysłane): `getMessages()` w vulcan-api-js
 * 3.5.4 zawsze woła Hebe z `folder=1`, a w Hebe folder 1 to skrzynka
 * ODEBRANYCH (2 = wysłane, 3 = usunięte) - własna poczta rodzica nie powinna
 * więc tu trafiać. Modele `Message`/`MessageBox` z biblioteki nie mają
 * żadnego pola kierunku (`Message`: id, globalKey, threadKey, subject,
 * content, sentDate, status, sender, receivers, attachments, readDate;
 * `MessageBox`: id, globalKey, name), więc odfiltrować dodatkowo nie ma po
 * czym. To ustalenie pochodzi z czytania kodu paczki, NIE z żywego konta
 * Vulcan - wymaga potwierdzenia na realnych danych (znany limit weryfikacji
 * opisany w planie integracji).
 */
async function synchronizujWiadomosci(
  baza: SupabaseClient,
  householdId: string,
  polaczenie: WierszPolaczenia,
  uczniowie: WierszUcznia[],
): Promise<WynikSync> {
  const wlasciciel = uczniowie[0]
  if (!wlasciciel) return { ok: true }

  try {
    // Endpoint skrzynek jest pod adresem jednostki ucznia (`restUrl` dostaje
    // symbol jednostki dopiero w `selectStudent`), więc wybieramy jednego
    // ucznia - ale pobieramy dane tylko raz na cały dom.
    const daneWlasciciela = wlasciciel.student_data as { __restUrl?: string }
    if (!daneWlasciciela.__restUrl) {
      return { ok: false, blad: `Brak zapisanego adresu REST dla ucznia ${wlasciciel.id} - połącz Vulcan ponownie.` }
    }
    const vulcan = await zbudujVulcanHebe(polaczenie, daneWlasciciela.__restUrl)
    await vulcan.selectStudent(wlasciciel.student_data as Student)

    const skrzynki = await vulcan.getMessageBoxes()
    const wiadomosci: Array<Record<string, unknown>> = []
    for (const skrzynka of skrzynki as Array<Record<string, unknown>>) {
      const klucz = skrzynka.globalKey as string | undefined
      if (!klucz) continue
      const zSkrzynki = await vulcan.getMessages(klucz)
      wiadomosci.push(...(zSkrzynki as Array<Record<string, unknown>>))
    }

    // Ta sama wiadomość potrafi wrócić z dwóch skrzynek pod tym samym
    // `globalKey` - bez deduplikacji upsert wywaliłby się na "cannot affect
    // row a second time".
    const wierszeWiadomosci = bezDuplikatow(
      wiadomosci
        .filter((m) => m.globalKey && m.sentDate)
        .map((m) => ({
          student_id: wlasciciel.id,
          household_id: householdId,
          sender: (m.sender as string | undefined) ?? '(nieznany nadawca)',
          subject: (m.subject as string | undefined) ?? '(brak tematu)',
          content: (m.content as string | undefined) ?? '',
          sent_at: new Date(m.sentDate as string | number | Date).toISOString(),
          vulcan_key: m.globalKey as string,
        })),
      (w) => `${w.student_id}|${w.vulcan_key}`,
    )

    if (wierszeWiadomosci.length > 0) {
      const { error: bladZapisu } = await baza
        .from('vulcan_messages')
        .upsert(wierszeWiadomosci, { onConflict: 'student_id,vulcan_key' })
      if (bladZapisu) throw new Error(`Zapis wiadomości nie powiódł się: ${bladZapisu.message}`)
    }

    const { error: bladKasowania } = await baza
      .from('vulcan_messages')
      .delete()
      .eq('household_id', householdId)
      .neq('student_id', wlasciciel.id)
    if (bladKasowania) {
      throw new Error(`Czyszczenie zduplikowanych wiadomości nie powiodło się: ${bladKasowania.message}`)
    }
  } catch (e) {
    // Błąd tu (jakikolwiek inny niż utrata sesji) jest nieszkodliwy dla
    // reszty synchronizacji (patrz komentarz przy wywołaniu tej funkcji w
    // synchronizujDom) - pełny stos zostaje w logach na wszelki wypadek.
    console.error(`Błąd synchronizacji wiadomości (dom ${householdId}):`, e instanceof Error ? e.stack : e)
    return await bladSynchronizacji(baza, householdId, e, 'Błąd synchronizacji wiadomości')
  }

  return { ok: true }
}
