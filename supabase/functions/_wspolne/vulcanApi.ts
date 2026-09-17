import { Attendance, Exam, Homework, Keystore, Lesson, Student, VulcanHebe } from 'npm:vulcan-api-js@3.5.4'
import { zbudujNaglowki } from './vulcanPodpis.ts'

const BASE_URL = 'https://lekcjaplus.vulcan.net.pl/'

/**
 * `Serializable.serialize()` z vulcan-api-js traktuje `source === null`
 * bezpiecznie (zwraca `null`), ale NIE `undefined` - a eduVULCAN potrafi
 * pominąć pole zagnieżdżonego obiektu/daty całkowicie (klucz nieobecny w
 * JSON, nie `null`), co dla każdego pola typu `DateTime`/`TimeSlot`/itd.
 * rzuca "Cannot read properties of undefined". Potwierdzone na żywo
 * 2026-09-13 (`getLessons` -> `Lesson.serialize` -> `DateTime.serialize`
 * na `Timestamp`, dla `Student.periods` analogicznie - patrz łatka niżej).
 * Biblioteka NIE eksportuje klasy `Serializable` wprost, ale wszystkie
 * modele (`Student`, `Lesson`, `Exam`, ...) dzielą JEDEN wspólny prototyp
 * przez łańcuch dziedziczenia - łatamy go raz, w miejscu ładowania modułu,
 * zamiast pola po polu. To rozszerza JUŻ ISTNIEJĄCE zachowanie biblioteki
 * (traktowanie braku danych jako `null`) na `undefined`, nie zmienia
 * semantyki dla żadnych prawdziwych danych.
 * (Osobny przypadek: pola budowane przez `customBind`, np. `Student.periods`
 * z `Periods`, NIE przechodzą przez `serialize()` i mają własną łatkę w
 * `pobierzUczniowEdu` niżej - ta poprawka ich nie obejmuje.)
 *
 * DRUGI, NIEZALEŻNY problem znaleziony na tym samym żywym koncie: nawet z
 * powyższą łatką `Lesson.date` wychodził `null` dla WSZYSTKICH 30 realnych
 * lekcji (nie brak danych - klucz istnieje pod INNĄ nazwą). Zrzut prawdziwych
 * kluczy surowego obiektu Lesson pokazał `DateAt`, nie `Date`, którego szuka
 * `bind("Date")` w bibliotece (zbudowanej pod starego Vulcan). `DateAt` to
 * jednak zwykły string `"RRRR-MM-DD"` (potwierdzone: `"2026-09-08"`), NIE
 * obiekt w kształcie, jakiego oczekuje zagnieżdżony model `DateTime`
 * (`{Timestamp, Date, DateDisplay, Time}`) - podstawienie go wprost pod klucz
 * `Date` dawało puste `{}` (`DateTime.serialize` czyta `source["Date"]` z
 * obiektu, a string nie ma takiej właściwości). Owijamy więc string w obiekt
 * `{Date: <string>}`, żeby trafił we właściwe pole `DateTime.date` - jedyne
 * pole tego modelu, którego `vulcanSync.ts` faktycznie używa
 * (`l.date!.date`). Tylko dla klasy `Lesson` i tylko gdy `Date` faktycznie
 * brakuje - jeśli kiedyś endpoint zacznie zwracać `Date` wprost, ta gałąź
 * się nie uruchomi.
 *
 * TRZECI przypadek TEGO SAMEGO wzorca (`XAt` zamiast `X`), znaleziony
 * 2026-09-16 żywą diagnostyką (zrzut surowego źródła PRZED `serialize()`,
 * nie tylko po) po tym, jak `vulcan_assignments` zostawało puste mimo
 * realnych zadań domowych w Vulcan: `Homework` wiąże `Deadline`
 * (`bind("Deadline")`, typ `Date` - zwykła wartość, bez zagnieżdżenia jak
 * `DateTime`), a eduVULCAN zwraca `DeadlineAt` (potwierdzone:
 * `"2026-09-16"`). Podstawiamy `Deadline: source.DeadlineAt` wprost, bez
 * owijania - w przeciwieństwie do `Lesson.Date` to pole NIE jest typu
 * `Serializable` (zobacz `serialize()`: `this[srcKey] = typeData.prototype
 * instanceof Serializable ? new typeData().serialize(srcObj) : srcObj`),
 * więc trafia do `this.deadline` bez żadnej dalszej obróbki.
 *
 * CZWARTY, ANALOGICZNY przypadek dla `Exam.deadline` (też `bind("Deadline")`,
 * ale typu `DateTime` jak `Lesson.date`) - podstawiony tym samym wzorcem co
 * `Lesson.Date/DateAt` (owinięty w `{Date: ...}`), na wypadek gdyby
 * eduVULCAN nazywał to pole tak samo jak w `Homework`. NIEPOTWIERDZONY
 * żywym testem (żadnych sprawdzianów w oknie synchronizacji w chwili
 * naprawy) - jeśli okaże się błędny, funkcja i tak tylko odrzuci wiersz
 * (istniejące „Ostrzeżenie: N sprawdzianów odrzuconych” w vulcanSync.ts),
 * nie zepsuje niczego innego.
 *
 * PIĄTY przypadek: `Attendance.date` wiąże `Day` (typ `DateTime`, jak
 * `Lesson.date`), eduVULCAN zwraca `DayAt` (płaski string, potwierdzone
 * żywo 2026-09-17: `"2026-09-16"`) - załatane tym samym wzorcem z
 * owinięciem w `{Date: ...}`.
 *
 * Wszystkie łatki wyżej opierają się na kształcie biblioteki, którego typy
 * publiczne (`index.d.ts`) nie gwarantują (wspólny, nieeksportowany
 * prototyp; nazwy klas zachowane w skompilowanym kodzie). Wersja jest
 * przypięta na sztywno (`npm:vulcan-api-js@3.5.4`), więc ryzyko cichej
 * zmiany jest niskie, ale asercje niżej zamieniają ewentualne rozjechanie
 * się założeń w GŁOŚNY błąd przy starcie funkcji (zamiast cichego
 * `date: null`/`deadline: undefined` i zsynchronizowanego "sukcesu" z zerem
 * wierszy - dokładnie tak ukrywały się te błędy przez wiele rund diagnozy
 * na żywo).
 */
if (
  Lesson.name !== 'Lesson' ||
  Homework.name !== 'Homework' ||
  Exam.name !== 'Exam' ||
  Attendance.name !== 'Attendance'
) {
  throw new Error(
    'vulcan-api-js: klasa Lesson/Homework/Exam/Attendance zmieniła nazwę w skompilowanym kodzie (możliwa minifikacja) - łatki pól *At przestałyby cicho działać.',
  )
}
;(() => {
  const wspolnyPrototyp = Object.getPrototypeOf(Student.prototype) as { serialize: (source: unknown) => unknown }
  if (typeof wspolnyPrototyp.serialize !== 'function') {
    throw new Error('vulcan-api-js: nieoczekiwany kształt Serializable.prototype - biblioteka mogła się zmienić.')
  }
  const oryginalnySerialize = wspolnyPrototyp.serialize
  wspolnyPrototyp.serialize = function (this: unknown, source: unknown) {
    const nazwaKlasy = (this as { constructor?: { name?: string } })?.constructor?.name
    let poprawioneZrodlo = source

    if (
      nazwaKlasy === 'Lesson' &&
      source &&
      typeof source === 'object' &&
      (source as Record<string, unknown>).Date == null &&
      (source as Record<string, unknown>).DateAt != null
    ) {
      poprawioneZrodlo = {
        ...(source as Record<string, unknown>),
        Date: { Date: (source as Record<string, unknown>).DateAt },
      }
    }

    if (
      nazwaKlasy === 'Homework' &&
      source &&
      typeof source === 'object' &&
      (source as Record<string, unknown>).Deadline == null &&
      (source as Record<string, unknown>).DeadlineAt != null
    ) {
      poprawioneZrodlo = {
        ...(poprawioneZrodlo as Record<string, unknown>),
        Deadline: (source as Record<string, unknown>).DeadlineAt,
      }
    }

    if (
      nazwaKlasy === 'Exam' &&
      source &&
      typeof source === 'object' &&
      (source as Record<string, unknown>).Deadline == null &&
      (source as Record<string, unknown>).DeadlineAt != null
    ) {
      poprawioneZrodlo = {
        ...(poprawioneZrodlo as Record<string, unknown>),
        Deadline: { Date: (source as Record<string, unknown>).DeadlineAt },
      }
    }

    if (
      nazwaKlasy === 'Attendance' &&
      source &&
      typeof source === 'object' &&
      (source as Record<string, unknown>).Day == null &&
      (source as Record<string, unknown>).DayAt != null
    ) {
      poprawioneZrodlo = {
        ...(poprawioneZrodlo as Record<string, unknown>),
        Day: { Date: (source as Record<string, unknown>).DayAt },
      }
    }

    return oryginalnySerialize.call(this, poprawioneZrodlo ?? null)
  }
})()

/** Wiersz `vulcan_connections` - dokładnie te kolumny, których potrzebuje ta warstwa. */
export type WierszPolaczenia = {
  certificate: string
  fingerprint: string
  private_key: string
  firebase_token: string | null
  device_model: string
}

type KontoTenant = { tenant: string; restUrl: string }

/** Odtwarza `Keystore` z zapisanych poświadczeń (bez konstruowania `VulcanHebe` - to teraz robi `zbudujVulcanHebe`). */
function odtworzKeystore(polaczenie: WierszPolaczenia): Keystore {
  const keystore = new Keystore()
  keystore.loadFromObject({
    certificate: polaczenie.certificate,
    fingerprint: polaczenie.fingerprint,
    privateKey: polaczenie.private_key,
    firebaseToken: polaczenie.firebase_token ?? '',
    deviceModel: polaczenie.device_model,
  })
  return keystore
}

/**
 * `VulcanHebe`/`Api` w bibliotece nie eksponuje własnego `restUrl` na
 * zewnątrz, a od tej integracji różni uczniowie mogą mieć różny `restUrl`
 * (różne tenanty eduVULCAN) - stąd jawny parametr zamiast wcześniejszego
 * czytania go z `polaczenie.account`. `VulcanHebe`/`Api` z biblioteki czyta
 * tylko pole `.restUrl` z przekazanego obiektu konta (potwierdzone w kodzie
 * biblioteki), więc prowizoryczny obiekt `{ restUrl }` wystarcza.
 */
export async function zbudujVulcanHebe(polaczenie: WierszPolaczenia, restUrl: string): Promise<VulcanHebe> {
  const keystore = odtworzKeystore(polaczenie)
  const vulcan = new VulcanHebe(keystore, { restUrl } as never)
  zlagodzBrakStatusu(vulcan)
  return vulcan
}

type WewnetrzneApi = {
  restUrl?: string
  buildPayload: (envelope: unknown) => unknown
  buildHeaders: (fullUrl: string, payload: string) => Record<string, string>
  request: (method: string, url: string, body?: unknown) => Promise<unknown>
}

/**
 * `Api.request()` w bibliotece (własność INSTANCJI, ustawiana w
 * konstruktorze - nie prototypu, więc łata się każdą instancję z osobna,
 * w tej funkcji, a nie modułowo jak łatka na `Serializable` wyżej) nigdy
 * nie sprawdzała kodu HTTP odpowiedzi - tylko obecność i wartość pola
 * `Status` w treści. Endpoint skrzynek wiadomości (`api/mobile/messagebox`,
 * używany przez `getMessageBoxes`/`getMessages`) odpowiada dla tego konta
 * HTTP 404 z treścią `{Message, MessageDetail}` w typowym kształcie błędu
 * ASP.NET Web API "brak takiego kontrolera" - potwierdzone na żywo
 * 2026-09-13. Przyczyna: eduVULCAN wymaga płatnego konta "Premium" do
 * wiadomości przez to API (potwierdzone w dokumentacji `hebece`, biblioteki
 * dedykowanej eduVULCAN - bez Premium te wywołania w ogóle nie działają).
 * Bez sprawdzenia `rawRes.ok` biblioteka próbowała czytać `Status`/`Code`
 * z treści błędu HTTP, co dawało nieczytelny `TypeError` zamiast jasnego
 * komunikatu.
 *
 * Podmieniamy `request` na równoważną reimplementację - używa TYCH SAMYCH,
 * już wyeksponowanych przez bibliotekę `buildPayload`/`buildHeaders`/
 * `restUrl` (więc podpis żądania wychodzi identyczny, zweryfikowane
 * różnicowo względem oryginału), z trzema zmianami względem oryginału:
 * (1) czytamy odpowiedź jako tekst i dopiero potem próbujemy JSON.parse
 * (tak samo jak `sparsujOdpowiedz` niżej) - błąd 502/504/WAF zwraca zwykle
 * HTML, nie JSON, a wołanie `.json()` wprost dałoby nieczytelny
 * `SyntaxError` zamiast informacji o kodzie HTTP; (2) jawne sprawdzenie
 * kodu HTTP z czytelnym komunikatem błędu zamiast ślepego czytania treści -
 * HTTP 401/403 dostaje w komunikacie dosłowne słowo "Unauthorized", żeby
 * `bladSynchronizacji` w `vulcanSync.ts` (dopasowanie po treści błędu -
 * biblioteka nie ma własnych klas wyjątków) nadal rozpoznawało utratę sesji
 * i włączało tryb "wymaga ponownej rejestracji", tak jak wcześniej robiło to
 * dla błędów samej biblioteki; (3) brak pola `Status` w treści (przy
 * poprawnym kodzie HTTP) liczy się jako sukces zamiast rzucać - inne konto/
 * tenant może kiedyś zwrócić dane bez tego pola tam, gdzie dziś go nie
 * brakuje. Prawdziwy błąd logiczny (`Status` obecny, `Code !== 0`) rzuca
 * dokładnie tak samo jak oryginał.
 */
function zlagodzBrakStatusu(vulcan: VulcanHebe): void {
  const api = (vulcan as unknown as { api: WewnetrzneApi }).api
  api.request = async (method: string, url: string, body?: unknown) => {
    const fullUrl = url.startsWith('http') ? url : api.restUrl ? api.restUrl + url : undefined
    if (!fullUrl) throw new Error('Relative URL specified but no account loaded!')
    const payload = body && method === 'POST' ? JSON.stringify(api.buildPayload(body)) : null
    const headers = api.buildHeaders(fullUrl, payload === null ? '' : payload)
    const options: RequestInit = { headers, method }
    if (payload !== null) options.body = payload
    const rawRes = await fetch(fullUrl, options)
    const tekstOdpowiedzi = await rawRes.text()
    // Prefiks liczony PRZED próbą JSON.parse - błąd 401/403 z ciałem, które
    // nie jest poprawnym JSON-em (pusta odpowiedź, strona HTML z WAF-a), musi
    // dalej zawierać dosłowne "Unauthorized", żeby `bladSynchronizacji` w
    // vulcanSync.ts (dopasowanie po treści błędu) rozpoznało utratę sesji
    // niezależnie od kształtu ciała odpowiedzi.
    const sesyjny = rawRes.status === 401 || rawRes.status === 403 ? 'Unauthorized - ' : ''
    let jsonRes: Record<string, unknown>
    try {
      jsonRes = JSON.parse(tekstOdpowiedzi)
    } catch {
      throw new Error(
        `${sesyjny}HTTP ${rawRes.status} dla ${url}: odpowiedź nie jest poprawnym JSON-em: ${tekstOdpowiedzi.slice(0, 300)}`,
      )
    }
    if (!rawRes.ok) {
      const opis =
        (jsonRes['MessageDetail'] as string | undefined) ??
        (jsonRes['Message'] as string | undefined) ??
        JSON.stringify(jsonRes).slice(0, 300)
      throw new Error(`${sesyjny}HTTP ${rawRes.status} dla ${url}: ${opis}`)
    }
    const status = jsonRes['Status'] as { Code?: number; Message?: string } | undefined
    if (status && status.Code !== 0) {
      throw new Error(status.Message ?? 'Nieznany błąd Vulcan.')
    }
    return jsonRes['Envelope'] ?? jsonRes
  }
}

function dekodujJwtPayload(jwt: string): { tenant: string } {
  const czesci = jwt.split('.')
  if (czesci.length !== 3) throw new Error('Nieprawidłowy JWT (oczekiwano 3 segmentów).')
  const uzupelnione = czesci[1].replace(/-/g, '+').replace(/_/g, '/')
  const payload = JSON.parse(atob(uzupelnione))
  if (typeof payload?.tenant !== 'string' || !payload.tenant) {
    throw new Error('JWT bez pola tenant.')
  }
  return payload
}

/**
 * Czyta odpowiedź jako tekst (nie od razu `.json()` - błąd 404/502 zwykle
 * zwraca HTML, nie JSON, a `.json()` rzuciłby wtedy nieczytelny `SyntaxError`
 * bez informacji o tenancie/statusie) i próbuje ją sparsować. Przy błędzie
 * parsowania rzuca czytelny wyjątek z kodem HTTP, tenantem i (przyciętą)
 * surową treścią odpowiedzi.
 */
async function sparsujOdpowiedz(odpowiedz: Response, tenant: string, opis: string): Promise<any> {
  const tekstOdpowiedzi = await odpowiedz.text()
  try {
    return JSON.parse(tekstOdpowiedzi)
  } catch {
    throw new Error(
      `${opis} nie powiodło się dla tenanta ${tenant}: HTTP ${odpowiedz.status}, odpowiedź nie jest poprawnym JSON-em: ${tekstOdpowiedzi.slice(0, 500)}`,
    )
  }
}

/**
 * Rejestruje certyfikat urządzenia przez JWT-y z eduVULCAN (zamiast Tokenu/
 * Symbolu/PIN-u starego Vulcan). Jeden wpis wynikowy per unikalny `tenant` -
 * zgodnie z tym, jak robi to oficjalna aplikacja (potwierdzone w bibliotekach
 * `hebece`/`iris`): każdemu tenantowi wysyła się WSZYSTKIE zebrane JWT-y, nie
 * tylko te dla niego - serwer sam wybiera właściwe.
 */
export async function zarejestrujPrzezJwt(keystore: Keystore, jwty: string[]): Promise<KontoTenant[]> {
  const tenanty = [...new Set(jwty.map((j) => dekodujJwtPayload(j).tenant))]
  const daneKeystore = keystore.dumpToObject()
  const wyniki: KontoTenant[] = []

  for (const tenant of tenanty) {
    const restUrl = `${BASE_URL}${tenant}/`
    const pelnyUrl = `${restUrl}api/mobile/register/jwt`
    const cialo = JSON.stringify({
      AppName: 'DzienniczekPlus 3.0',
      AppVersion: '25.02.14 (G)',
      Envelope: {
        OS: 'Android',
        DeviceModel: daneKeystore.deviceModel,
        Certificate: daneKeystore.certificate,
        CertificateType: 'X509',
        CertificateThumbprint: daneKeystore.fingerprint,
        Tokens: jwty,
        selfIdentifier: crypto.randomUUID(),
      },
      NotificationToken: '',
      API: 1,
      RequestId: crypto.randomUUID(),
      Timestamp: Math.floor(Date.now() / 1000),
      TimestampFormatted: new Date().toISOString().replace('T', ' ').slice(0, 19),
    })
    const naglowki = zbudujNaglowki(
      daneKeystore.fingerprint!,
      daneKeystore.privateKey!,
      daneKeystore.deviceModel!,
      cialo,
      pelnyUrl,
    )
    const odpowiedz = await fetch(pelnyUrl, { method: 'POST', headers: naglowki, body: cialo })
    const dane = await sparsujOdpowiedz(odpowiedz, tenant, 'Rejestracja JWT')
    // Prawdziwa biblioteka (`vulcan-api-js`) traktuje sukces jako `Status.Code === 0`,
    // a rzuca na KAŻDY niezerowy kod (nie tylko ujemny) - backend zgłasza błędy
    // logiczne również jako HTTP 200 z dodatnim `Status.Code`.
    if (!odpowiedz.ok || (dane?.Status?.Code ?? 0) !== 0) {
      throw new Error(
        `Rejestracja JWT nie powiodła się dla tenanta ${tenant}: HTTP ${odpowiedz.status}, ${JSON.stringify(dane).slice(0, 500)}`,
      )
    }
    wyniki.push({ tenant, restUrl })
  }

  if (wyniki.length === 0) throw new Error('Brak poprawnych JWT-ów do rejestracji.')
  return wyniki
}

/**
 * Pobiera uczniów dla każdego zarejestrowanego tenanta (`GET .../api/mobile/register/hebe?mode=2`
 * - z `?mode=2`, bo bez niego eduVULCAN nie zwraca poprawnych danych, w
 * odróżnieniu od starego Vulcan, gdzie `VulcanHebe.getStudents()` z biblioteki
 * woła ten sam endpoint BEZ tego parametru - stąd własne wywołanie zamiast
 * reużycia metody biblioteki). Każdy zwrócony `Student` dostaje dodatkowe
 * pola `__tenant`/`__restUrl`, żeby `vulcanSync.ts` wiedział, którego adresu
 * REST użyć przy kolejnych synchronizacjach tego ucznia.
 */
export async function pobierzUczniowEdu(
  keystore: Keystore,
  konta: KontoTenant[],
): Promise<Array<Student & { __tenant: string; __restUrl: string }>> {
  const daneKeystore = keystore.dumpToObject()
  const wszyscyUczniowie: Array<Student & { __tenant: string; __restUrl: string }> = []

  for (const { tenant, restUrl } of konta) {
    const pelnyUrl = `${restUrl}api/mobile/register/hebe?mode=2`
    const naglowki = zbudujNaglowki(
      daneKeystore.fingerprint!,
      daneKeystore.privateKey!,
      daneKeystore.deviceModel!,
      '', // GET bez ciała - pusty string, NIE null (patrz uwaga przy zbudujNaglowki w Zadaniu 1)
      pelnyUrl,
    )
    const odpowiedz = await fetch(pelnyUrl, { method: 'GET', headers: naglowki })
    const dane = await sparsujOdpowiedz(odpowiedz, tenant, 'Pobranie uczniów')
    if (!odpowiedz.ok || (dane?.Status?.Code ?? 0) !== 0) {
      throw new Error(
        `Pobranie uczniów nie powiodło się dla tenanta ${tenant}: HTTP ${odpowiedz.status}, ${JSON.stringify(dane).slice(0, 500)}`,
      )
    }
    // Jawne rozróżnienie "brak pola Envelope" (błąd - rzuć wyjątek) od
    // "puste Envelope" (poprawny wynik - zero uczniów dla tego tenanta).
    if (!Array.isArray(dane?.Envelope)) {
      throw new Error(
        `Pobranie uczniów nie powiodło się dla tenanta ${tenant}: brak pola Envelope w odpowiedzi: ${JSON.stringify(dane).slice(0, 500)}`,
      )
    }
    const surowiUczniowie: unknown[] = dane.Envelope
    for (const surowy of surowiUczniowie) {
      // `Student.serialize()` z vulcan-api-js zawsze robi `data.Periods.map(...)`
      // (patrz `bindPeriods` w bibliotece) - zakłada, że `Periods` to zawsze
      // tablica. eduVULCAN potrafi zwrócić ucznia bez pola `Periods` (`null`),
      // co rzuca `TypeError: Cannot read properties of null (reading 'map')`
      // - potwierdzone na żywo 2026-09-13. Dogenerowujemy pustą tablicę, żeby
      // nie modyfikować samej biblioteki.
      const rekord = surowy as Record<string, unknown> | null
      const bezpiecznyRekord = rekord && rekord.Periods == null ? { ...rekord, Periods: [] } : rekord
      const uczen = new Student().serialize(bezpiecznyRekord) as Student & { __tenant: string; __restUrl: string }
      uczen.__tenant = tenant
      uczen.__restUrl = restUrl
      wszyscyUczniowie.push(uczen)
    }
  }

  return wszyscyUczniowie
}

/** Jedna wiadomość eduVULCAN, już w kształcie gotowym do zapisu w `vulcan_messages`. */
export type WiadomoscEdu = {
  vulcanKey: string
  nadawca: string
  temat: string
  tresc: string
  sentAtIso: string
}

export type WynikWiadomosciEdu = { wiadomosci: WiadomoscEdu[] } | { wymaganePremium: true }

/**
 * eduVULCAN NIE ma osobnego endpointu "listuj skrzynki wiadomości" jak stary
 * Vulcan - klucz skrzynki (`MessageBox.GlobalKey`) i `Unit.Symbol` leżą wprost
 * na obiekcie ucznia z `register/hebe`. Klasa `Student` z vulcan-api-js gubi
 * pole `MessageBox` (nie jest zadeklarowane w jej dekoratorach, `serialize()`
 * kopiuje tylko pola, które klasa zna), więc pobieramy surową odpowiedź
 * jeszcze raz zamiast czytać ją z już zserializowanego `Student` zapisanego
 * w bazie.
 */
async function znajdzSkrzynke(
  polaczenie: WierszPolaczenia,
  restUrl: string,
  pupilId: number,
): Promise<{ box: string; unitSymbol: string } | null> {
  const pelnyUrl = `${restUrl}api/mobile/register/hebe?mode=2`
  const naglowki = zbudujNaglowki(polaczenie.fingerprint, polaczenie.private_key, polaczenie.device_model, '', pelnyUrl)
  const odpowiedz = await fetch(pelnyUrl, { method: 'GET', headers: naglowki })
  const dane = await sparsujOdpowiedz(odpowiedz, restUrl, 'Pobranie uczniów (wiadomości)')
  if (!odpowiedz.ok || (dane?.Status?.Code ?? 0) !== 0) {
    throw new Error(
      `Pobranie uczniów (wiadomości) nie powiodło się: HTTP ${odpowiedz.status}, ${JSON.stringify(dane).slice(0, 500)}`,
    )
  }
  const surowi: Array<Record<string, unknown>> = Array.isArray(dane?.Envelope) ? dane.Envelope : []
  const znaleziony = surowi.find((s) => Number((s?.Pupil as { Id?: unknown })?.Id) === pupilId)
  const skrzynka = znaleziony?.MessageBox as { GlobalKey?: string } | undefined
  const jednostka = znaleziony?.Unit as { Symbol?: string } | undefined
  if (!skrzynka?.GlobalKey || !jednostka?.Symbol) return null
  return { box: skrzynka.GlobalKey, unitSymbol: jednostka.Symbol }
}

/**
 * Wiadomości eduVULCAN - INNY kontroler REST niż stary Vulcan
 * (`api/mobile/messages/received/byBox`, nie `api/mobile/messagebox`, którego
 * eduVULCAN w ogóle nie ma - potwierdzone żywym HTTP 404 "No type was found
 * that matches the controller named 'mobile'" 2026-09-14). Ogólny kształt
 * endpointu wzięty z `hebece` (biblioteki referencyjnej napisanej pod
 * eduVULCAN), ale pole daty wysłania różni się od jej dokumentacji - żywa
 * odpowiedź ma płaski string `SentAt`, nie zagnieżdżony obiekt `DateSent`
 * (ten sam wzorzec zmienionej nazwy pola, co wcześniej `Lesson.Date`/`DateAt`).
 *
 * `hebece` dokumentuje, że to konkretne API zwraca błąd `EDUVULCAN_PREMIUM`,
 * gdy konto nie ma wykupionej płatnej wersji aplikacji mobilnej - odróżniamy
 * to od zwykłego błędu synchronizacji (zwracamy rozpoznawalny wynik zamiast
 * rzucać), żeby dało się to pokazać użytkownikowi wprost zamiast ukrywać jako
 * nieznaną awarię. (Na tym koncie - potwierdzone żywo 2026-09-14 - API zwraca
 * prawdziwe wiadomości, więc premium NIE jest wymagane tutaj mimo tej uwagi
 * w dokumentacji `hebece`.)
 */
export async function pobierzWiadomosciEdu(
  polaczenie: WierszPolaczenia,
  restUrl: string,
  pupilId: number,
): Promise<WynikWiadomosciEdu> {
  const skrzynka = await znajdzSkrzynke(polaczenie, restUrl, pupilId)
  if (!skrzynka) return { wiadomosci: [] }

  const pelnyUrl = `${restUrl}${skrzynka.unitSymbol}/api/mobile/messages/received/byBox?box=${encodeURIComponent(skrzynka.box)}&lastId=-2147483648&pupilId=${pupilId}&pageSize=500`
  const naglowki = zbudujNaglowki(polaczenie.fingerprint, polaczenie.private_key, polaczenie.device_model, '', pelnyUrl)
  const odpowiedz = await fetch(pelnyUrl, { method: 'GET', headers: naglowki })
  const dane = await sparsujOdpowiedz(odpowiedz, restUrl, 'Pobranie wiadomości')

  if ((dane?.Status?.Message as string | undefined) === 'EDUVULCAN_PREMIUM') {
    return { wymaganePremium: true }
  }
  if (!odpowiedz.ok || (dane?.Status?.Code ?? 0) !== 0) {
    throw new Error(`Pobranie wiadomości nie powiodło się: HTTP ${odpowiedz.status}, ${JSON.stringify(dane).slice(0, 500)}`)
  }

  const surowe: Array<Record<string, unknown>> = Array.isArray(dane?.Envelope) ? dane.Envelope : []
  const wiadomosci = surowe
    .filter((m) => m?.GlobalKey && m?.SentAt)
    .map((m) => ({
      vulcanKey: String(m.GlobalKey),
      nadawca: (m.Sender as { Name?: string } | undefined)?.Name ?? '(nieznany nadawca)',
      temat: (m.Subject as string | undefined) ?? '(brak tematu)',
      tresc: (m.Content as string | undefined) ?? '',
      sentAtIso: new Date(m.SentAt as string).toISOString(),
    }))
  return { wiadomosci }
}
