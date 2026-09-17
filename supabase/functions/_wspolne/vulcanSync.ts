import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Attendance, Student } from 'npm:vulcan-api-js@3.5.4'
import { pobierzWiadomosciEdu, zbudujVulcanHebe, type WierszPolaczenia } from './vulcanApi.ts'

type WierszUcznia = { id: string; student_data: unknown }
type WynikSync = { ok: boolean; blad?: string }

/** Ile tygodni planu lekcji (i zmian) synchronizujemy naprzod od biezacego
 *  tygodnia - Vulcan/eduVULCAN w oficjalnej apce pozwala przegladac dalej niz
 *  tydzien, wiec nasz kalendarz nie powinien urywac sie wczesniej. */
const TYGODNIE_PLANU = 4

function poczatekTygodnia(d: Date): Date {
  const kopia = new Date(d)
  const dzien = (kopia.getDay() + 6) % 7 // 0 = poniedziałek
  kopia.setDate(kopia.getDate() - dzien)
  kopia.setHours(0, 0, 0, 0)
  return kopia
}

/** Koniec zsynchronizowanego okna: `tygodni` tygodni od poczatku (wylacznie). */
function koniecOkna(poczatek: Date, tygodni: number): Date {
  const kopia = new Date(poczatek)
  kopia.setDate(kopia.getDate() + tygodni * 7)
  return kopia
}

/** 1 wrzesnia biezacego roku szkolnego (Polska: rok szkolny trwa wrzesien-czerwiec,
 *  wiec od stycznia do sierpnia "biezacy" rok szkolny zaczal sie we WRZESNIU
 *  POPRZEDNIEGO roku kalendarzowego). Uzywane jako dolna granica synchronizacji
 *  frekwencji - nieobecnosci od poczatku roku szkolnego, nie caly czas. */
function poczatekRokuSzkolnego(d: Date): Date {
  const rokSzkolny = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1
  return new Date(rokSzkolny, 8, 1)
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
  const koniec = koniecOkna(poczatek, TYGODNIE_PLANU)
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

      // `getChangedLessons` na eduVULCAN NIE zwraca własnej daty/godziny/
      // przedmiotu (`lessonDate`/`time`/`subject` zawsze `null` - potwierdzone
      // żywą diagnostyką 2026-09-16) - to jedynie powiadomienie "ten slot planu
      // (scheduleId) ma zastępstwo", identyfikowane przez `scheduleId`, który
      // odpowiada `Lesson.id` tej samej, zwykłej lekcji z `getLessons`. Zamiast
      // budować z `zmiany` osobne, nigdy niekompletne wiersze - łączymy każdą
      // zmianę z jej lekcją po tym id i podmieniamy tylko nauczyciela (w
      // zaobserwowanych przypadkach zastępujący nauczyciel różni się od
      // `Lesson.teacherPrimary`, który zostaje niezmieniony - to STAŁY
      // przydział przedmiotu, nie tego dnia).
      const zmianyPoScheduleId = new Map(
        zmiany.filter((z) => z.scheduleId != null).map((z) => [z.scheduleId as number, z]),
      )
      if (zmiany.length > 0 && zmianyPoScheduleId.size === 0) {
        console.error(
          `Ostrzeżenie: ${zmiany.length} zmian planu dla ucznia ${uczen.id} bez scheduleId - możliwy brak/inna nazwa pola.`,
        )
      } else if (zmianyPoScheduleId.size > 0) {
        const dopasowane = lekcjePrzefiltrowane.filter((l) => zmianyPoScheduleId.has(l.id)).length
        if (dopasowane === 0) {
          // scheduleId nie trafia w żadną lekcję z TEGO SAMEGO okna - albo
          // zmiana dotyczy dnia poza oknem 4 tygodni, albo (jak wcześniej z
          // Lesson.date) eduVULCAN znów zmienił kształt odpowiedzi.
          console.error(
            `Ostrzeżenie: ${zmianyPoScheduleId.size} zmian planu dla ucznia ${uczen.id} nie dopasowanych do żadnej lekcji w oknie synchronizacji.`,
          )
        }
      }

      const wierszePlanu = lekcjePrzefiltrowane.map((l) => {
        const zmiana = zmianyPoScheduleId.get(l.id)
        const zmieniona = Boolean(l.change) || Boolean(zmiana)
        return {
          student_id: uczen.id,
          household_id: householdId,
          lesson_date: l.date!.date,
          start_time: l.timeSlot!.start,
          end_time: l.timeSlot!.end,
          subject: l.subject?.name ?? l.event ?? '(brak przedmiotu)',
          teacher: zmiana?.teacher?.displayName ?? l.teacherPrimary?.displayName ?? null,
          room: l.room?.code ?? null,
          changed: zmieniona,
          change_note: zmieniona ? ((zmiana?.note ?? zmiana?.reason ?? 'Zastępstwo') as string) : null,
        }
      })

      // Najpierw kasujemy całe zsynchronizowane okno tego ucznia, dopiero
      // potem wstawiamy nowy plan. Sam upsert zostawiłby na zawsze lekcje
      // USUNIĘTE z planu w Vulcan (nic ich nigdy nie nadpisze), więc to okno
      // z czasem przestawałoby być prawdą.
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

      // Frekwencja: caly biezacy rok szkolny (nie tylko okno planu lekcji) -
      // `getAttendance` MUTUJE swoj drugi argument (dopisuje jedna dobe), wiec
      // dostaje ZAWSZE swiezy obiekt Date, nigdy `koniec` z lekcji wyzej.
      const obecnosci = (await vulcan.getAttendance(poczatekRokuSzkolnego(new Date()), new Date())) as Attendance[]
      const obecnosciPrzefiltrowane = obecnosci.filter((a) => a.date?.date && a.presenceType)
      if (obecnosci.length > 0 && obecnosciPrzefiltrowane.length === 0) {
        console.error(
          `Ostrzeżenie: ${obecnosci.length} wpisów frekwencji dla ucznia ${uczen.id} odrzuconych przez filtr daty/typu - możliwy brak/inna nazwa pola.`,
        )
      }
      // Zakres celowo ograniczony do nieobecności (ustalone z userem) - zwykła
      // obecność na lekcji nie trafia do bazy, więc tabela zostaje mała i
      // dotyczy dokładnie tego, po co ta integracja powstała.
      const nieobecnosciPrzefiltrowane = obecnosciPrzefiltrowane.filter((a) => a.presenceType?.absence)
      const wierszeObecnosci = bezDuplikatow(
        nieobecnosciPrzefiltrowane.map((a) => ({
          student_id: uczen.id,
          household_id: householdId,
          attendance_date: a.date!.date,
          subject: a.subject?.name ?? '(brak przedmiotu)',
          presence_name: a.presenceType?.name ?? '(brak nazwy)',
          absence: Boolean(a.presenceType?.absence),
          justified: Boolean(a.presenceType?.justified),
          exemption: Boolean(a.presenceType?.exemption),
          vulcan_key: String(a.id),
        })),
        (w) => `${w.student_id}|${w.vulcan_key}`,
      )
      if (wierszeObecnosci.length > 0) {
        const { error: bladZapisu } = await baza
          .from('vulcan_attendance')
          .upsert(wierszeObecnosci, { onConflict: 'student_id,vulcan_key' })
        if (bladZapisu) throw new Error(`Zapis frekwencji nie powiódł się: ${bladZapisu.message}`)
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
 * Wiadomości - RAZ NA UCZNIA, nie raz na dom.
 *
 * Wcześniejsze założenie ("skrzynki należą do konta rodzica, nie dziecka")
 * było prawdziwe dla STAREGO Vulcan, ale NIE dla eduVULCAN - żywy test
 * 2026-09-14 pokazał, że każdy uczeń ma WŁASNĄ skrzynkę (`MessageBox.GlobalKey`
 * per `Pupil.Id` w `register/hebe`), z inną treścią. Synchronizujemy więc
 * skrzynkę KAŻDEGO ucznia pod jego własnym `student_id` - jeden uczeń
 * pominięty (brak adresu REST/Pupil.Id, błąd pobierania) nie blokuje
 * pozostałych, tak samo jak w pętli lekcji w `synchronizujDom`.
 *
 * Pobieranie idzie przez `pobierzWiadomosciEdu` (`_wspolne/vulcanApi.ts`) -
 * WŁASNĄ implementację endpointu eduVULCAN, NIE `vulcan.getMessageBoxes()`/
 * `getMessages()` z `vulcan-api-js`. Te dwie metody biblioteki wołają
 * `api/mobile/messagebox` - endpoint STAREGO Vulcan, którego eduVULCAN w
 * ogóle nie ma (żywy test 2026-09-14: HTTP 404 "No type was found that
 * matches the controller named 'mobile'" - błąd routingu, nie sesji/premium).
 * Prawdziwy endpoint eduVULCAN (`api/mobile/messages/received/byBox`) pochodzi
 * z `hebece` - biblioteki referencyjnej napisanej pod eduVULCAN.
 */
/** Zakładka „Wiadomości" pokazuje tylko ostatnie 14 dni (patrz `Szkola.tsx`) -
 *  30 dni zapasu tutaj, żeby drobne różnice stref czasowych/godzin nigdy nie
 *  obcięły czegoś, co user i tak zaraz zobaczy. Bez tej granicy `select('*')`
 *  w `useVulcan.ts` ciągnąłby za każdym razem CAŁE do 500 najstarszych
 *  wiadomości na dziecko (eduVULCAN nie ma parametru zakresu dat w tym
 *  endpoincie) - potwierdzone żywo 2026-09-14: 504 wiersze / ~520 KB zamiast
 *  10 wierszy / ~9 KB dla realnie potrzebnego okna. */
const GRANICA_WIADOMOSCI_DNI = 30

async function synchronizujWiadomosci(
  baza: SupabaseClient,
  householdId: string,
  polaczenie: WierszPolaczenia,
  uczniowie: WierszUcznia[],
): Promise<WynikSync> {
  const granica = new Date()
  granica.setDate(granica.getDate() - GRANICA_WIADOMOSCI_DNI)

  const wszystkieWiersze: Array<{
    student_id: string
    household_id: string
    sender: string
    subject: string
    content: string
    sent_at: string
    vulcan_key: string
  }> = []
  const zsynchronizowaniUczniowie: string[] = []

  for (const uczen of uczniowie) {
    const daneUcznia = uczen.student_data as { __restUrl?: string; pupil?: { id?: unknown } }
    if (!daneUcznia.__restUrl) {
      console.error(`Pomijam wiadomości ucznia ${uczen.id}: brak zapisanego adresu REST - połącz Vulcan ponownie.`)
      continue
    }
    const pupilId = Number(daneUcznia.pupil?.id)
    if (!Number.isFinite(pupilId)) {
      console.error(`Pomijam wiadomości ucznia ${uczen.id}: brak identyfikatora ucznia (Pupil.Id).`)
      continue
    }

    try {
      const wynik = await pobierzWiadomosciEdu(polaczenie, daneUcznia.__restUrl, pupilId)
      if ('wymaganePremium' in wynik) {
        // Nie jest to błąd naszej synchronizacji - eduVULCAN świadomie odmawia
        // dostępu do wiadomości przez to API bez płatnej wersji aplikacji
        // (potwierdzone w dokumentacji `hebece`). Zostawiamy widoczny ślad w
        // logach, ale NIE traktujemy tego jak awarię tego ucznia.
        console.error(
          `Wiadomości niedostępne dla ucznia ${uczen.id} (dom ${householdId}): eduVULCAN zwrócił EDUVULCAN_PREMIUM.`,
        )
        continue
      }
      for (const m of wynik.wiadomosci) {
        if (new Date(m.sentAtIso) < granica) continue
        wszystkieWiersze.push({
          student_id: uczen.id,
          household_id: householdId,
          sender: m.nadawca,
          subject: m.temat,
          content: m.tresc,
          sent_at: m.sentAtIso,
          vulcan_key: m.vulcanKey,
        })
      }
      zsynchronizowaniUczniowie.push(uczen.id)
    } catch (e) {
      const wynikBledu = await bladSynchronizacji(
        baza,
        householdId,
        e,
        `Błąd synchronizacji wiadomości ucznia ${uczen.id}`,
      )
      // Sesja wygasła dotyczy całego połączenia, nie tylko tego ucznia -
      // zgłaszamy od razu, tak samo jak w pętli lekcji.
      if (wynikBledu.blad?.startsWith('Sesja Vulcan wygasła')) return wynikBledu
      console.error(`Pomijam wiadomości ucznia ${uczen.id}: ${wynikBledu.blad}`)
    }
  }

  // Ta sama wiadomość potrafi wrócić dwa razy pod tym samym `vulcan_key` -
  // bez deduplikacji upsert wywaliłby się na "cannot affect row a second time".
  const wierszeWiadomosci = bezDuplikatow(wszystkieWiersze, (w) => `${w.student_id}|${w.vulcan_key}`)
  if (wierszeWiadomosci.length > 0) {
    const { error: bladZapisu } = await baza
      .from('vulcan_messages')
      .upsert(wierszeWiadomosci, { onConflict: 'student_id,vulcan_key' })
    if (bladZapisu) return { ok: false, blad: `Zapis wiadomości nie powiódł się: ${bladZapisu.message}` }
  }

  // Sprząta wiadomości, które w międzyczasie wypadły z granicy - bez tego
  // tabela rosłaby bezterminowo (eduVULCAN zawsze zwraca to samo okno do 500
  // najnowszych, więc stare wiadomości bez tego czyszczenia zostałyby w bazie
  // na zawsze, nawet gdy wypadną z zakresu, który cokolwiek jeszcze pokazuje).
  // Tylko dla uczniów, których synchronizacja się w tym przebiegu udała -
  // nieudany uczeń nie traci danych, które i tak nie zostały odświeżone.
  if (zsynchronizowaniUczniowie.length > 0) {
    const { error: bladCzyszczenia } = await baza
      .from('vulcan_messages')
      .delete()
      .in('student_id', zsynchronizowaniUczniowie)
      .lt('sent_at', granica.toISOString())
    if (bladCzyszczenia) {
      return { ok: false, blad: `Czyszczenie starych wiadomości nie powiodło się: ${bladCzyszczenia.message}` }
    }
  }

  return { ok: true }
}
