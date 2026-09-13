# Rejestracja Vulcan przez eduVULCAN (JWT) — plan wdrożenia

> **Dla agentów:** WYMAGANY SUB-SKILL: użyj `superpowers:subagent-driven-development`
> (zalecane) albo `superpowers:executing-plans`, żeby wykonać ten plan zadanie po
> zadaniu. Kroki mają checkboxy (`- [ ]`) do odhaczania.
>
> **WYKONANE (2026-09-13) - ten plan jest historycznym zapisem projektu, NIE
> aktualnym opisem kodu.** Recenzje zadań i dalsza diagnoza na żywym koncie
> zmieniły fragmenty kodu podanego niżej - konkretnie: Zadanie 2 (kod poniżej
> ma pierwotny, błędny warunek `Status.Code < 0` i `dane.Envelope ?? []` -
> naprawione w recenzji, commit `ab0b52e`) i Zadanie 4 (kod poniżej ma
> pierwotny regex `wyciagnijApJson`, zastąpiony wersją odporną na kolejność
> atrybutów HTML w commicie `36023c4`). Pełna, ostateczna historia zmian
> (włącznie z poprawkami znalezionymi dopiero na żywym koncie użytkownika już
> po wdrożeniu) jest w `.superpowers/sdd/2026-09-13-vulcan-rejestracja-edu/progress.md`
> i w `git log`. **W razie wątpliwości ufaj kodowi w repo, nie temu
> dokumentowi.**

**Cel:** Zamienić rejestrację Vulcan (Token/Symbol/PIN) na rejestrację przez
eduVULCAN — rodzic loguje się w przeglądarce na `eduvulcan.pl`, wchodzi na
`/api/ap`, wkleja zawartość strony do naszego formularza. Powód: szkoła
użytkownika jest na eduVULCAN, gdzie stary „Dostęp mobilny" (Token/Symbol/PIN)
nie istnieje — cała wcześniej zbudowana integracja (schemat bazy, sync, ekran
„Szkoła") **zostaje bez zmian**, zmienia się wyłącznie sposób rejestracji.

**Architektura:** eduVULCAN i stary Vulcan dzielą to samo zaplecze REST
(`lekcjaplus.vulcan.net.pl`) i ten sam schemat podpisywania żądań certyfikatem
(RSA-SHA256) — potwierdzone niezależnie w dwóch bibliotekach open-source
(`hebece` w Node.js, `iris` w Pythonie) i zweryfikowane na żywo na koncie
użytkownika (patrz sekcja „Zweryfikowane fakty" niżej). Różni się tylko
**rejestracja**: zamiast `POST api/mobile/register/new` z Tokenem/Symbolem/
PIN-em, trzeba wywołać `POST api/mobile/register/jwt` z tablicą JWT-ów
wydobytych ze strony `/api/ap`, per unikalny `tenant` (odpowiednik dawnego
„symbolu"). `vulcan-api-js@3.5.4` (biblioteka, na której już się opieramy) NIE
obsługuje tej ścieżki i nie ma nowszej wersji — dopisujemy własną, małą
warstwę podpisywania i dwa nowe wywołania REST, ale **reużywamy** eksportowane
klasy modeli tej biblioteki (`Student`, `Keystore`) do parsowania odpowiedzi,
oraz całą resztę istniejącego kodu (`VulcanHebe.getLessons/getExams/...`,
`vulcanSync.ts`, schemat bazy, ekran „Szkoła") bez zmian.

**Stack:** Supabase Edge Functions (Deno), `npm:node-forge@1.3.1` (ten sam,
którego `vulcan-api-js` już używa transitywnie — potwierdzone działające w tym
środowisku spike'em z wcześniejszej integracji), React 19 + TypeScript.

## Zweryfikowane fakty (na żywo, na koncie użytkownika, 2026-09-13)

- `https://eduvulcan.pl/api/ap` po zalogowaniu zwraca HTML z ukrytym polem
  `<input id="ap" value="...">`, którego wartość to JSON:
  `{Tokens: string[], Alias, Email, EmailCandidate, GivenName, Surname,
  IsConsentAccepted, CanAcceptConsent, AccessToken, Capabilities, Success,
  ErrorMessage}` — dokładnie zgodne z dokumentacją biblioteki `iris`.
- `Tokens` to tablica JWT (jeden na dziecko/tenant) — na koncie testowym 3
  sztuki, dokładnie tyle dzieci ile przypisanych.
- Każdy JWT to RS256, payload: `{name, uid, tenant, unituid, uri, service,
  caps, nbf, exp, iat}` — `tenant` to odpowiednik dawnego „symbolu" (np.
  nazwa gminy/miasta), używany do zbudowania adresu REST.
- Algorytm podpisywania żądań (SHA-256 digest ciała, RSA-SHA256 podpis
  konkatenacji wartości nagłówków, certyfikat w formacie PEM) jest
  **identyczny** w `vulcan-api-js` (już działający, zweryfikowany na żywo w
  poprzedniej integracji) i w `hebece`/`iris` (niezależna implementacja tego
  samego protokołu dla eduVULCAN) — patrz Zadanie 1 poniżej, kod skopiowany
  wprost z `vulcan-api-js`, nie z `hebece`, żeby zminimalizować ryzyko
  rozjazdu z tym, co już działa.

## Ograniczenia globalne

- Formularz Token/Symbol/PIN **znika całkowicie** — to prywatna aplikacja
  jednej rodziny, szkoła użytkownika jest na eduVULCAN, nie ma potrzeby
  wspierać obu ścieżek rejestracji.
- `vulcan_connections.account` (już `jsonb`, bez zmiany typu) zmienia kształt
  z `{loginId, userLogin, userName, restUrl}` na tablicę
  `Array<{tenant: string, restUrl: string}>` — bez migracji schematu (kolumna
  już jest `jsonb`, kształt wewnątrz nie jest wymuszony przez bazę).
- `vulcan_students.student_data` (już `jsonb`) dostaje dwa dodatkowe,
  wewnętrzne pola `__tenant`/`__restUrl` obok pól modelu `Student` z
  biblioteki — potrzebne, żeby `vulcanSync.ts` wiedział, którego z (być może
  wielu) adresów REST użyć dla danego ucznia. Podwójny podkreślnik to
  celowa konwencja odróżniająca „nasze" pola od pól biblioteki.
- Wszystkie nowe wywołania sieciowe idą przez wspólną funkcję podpisującą z
  Zadania 1 — nie duplikuj logiki podpisywania w kolejnych zadaniach.
- Testy `npm test -- --run`, lint `npm run lint`, build `npm run build` —
  muszą przechodzić przed każdym commitem dotykającym `src/`. Pliki Deno
  (`supabase/functions/**`) są poza zasięgiem tych komend.
- Projekt Supabase: ref `fqviwnzinpndyprcovxw`.
- Commity po polsku, stopka dokładnie:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Bez prawdziwego konta nie da się przetestować end-to-end wcześniej niż w
  Zadaniu 5** — to świadome, ostatnie zadanie planu jest właśnie tym testem.
  Zadania 1-4 weryfikuje się przez testy jednostkowe czystej logiki (Zadanie
  1) i przegląd kodu (Zadania 2-4), nie przez realne wywołanie sieciowe.

---

## Struktura plików

| Plik | Rola |
| --- | --- |
| `supabase/functions/_wspolne/vulcanPodpis.ts` | nowy — port algorytmu podpisywania żądań z `vulcan-api-js` (digest, kanoniczna ścieżka, podpis RSA-SHA256, komplet nagłówków) |
| `supabase/functions/_wspolne/vulcanPodpis.test.ts` | nowy — testy jednostkowe czystych funkcji (bez sieci) |
| `supabase/functions/_wspolne/vulcanApi.ts` | modyfikacja — nowe funkcje `zarejestrujPrzezJwt`/`pobierzUczniowEdu`, `zbudujVulcanHebe` dostaje jawny `restUrl` |
| `supabase/functions/_wspolne/vulcanSync.ts` | modyfikacja — wybór `restUrl` per uczeń z `student_data.__restUrl` |
| `supabase/functions/vulcan-polacz/index.ts` | modyfikacja — przyjmuje `{ apContent }` zamiast `{token, symbol, pin}`, parsuje, woła nową rejestrację |
| `src/useVulcan.ts` | modyfikacja — `polacz(apContent: string)` zamiast trzech parametrów |
| `src/MojDom.tsx` | modyfikacja — jedno pole tekstowe zamiast trzech, nowa instrukcja |
| `src/style/formularze.css` | modyfikacja — styl dla `<textarea>` zamiast trzech `<input>` |

---

### Zadanie 1: `_wspolne/vulcanPodpis.ts` — podpisywanie żądań

**Pliki:**
- Utworzenie: `supabase/functions/_wspolne/vulcanPodpis.ts`
- Utworzenie: `supabase/functions/_wspolne/vulcanPodpis.test.ts`

**Interfejsy:**
- Produkuje: `podpiszZadanie(fingerprint: string, privateKeyPem: string, cialo: string, pelnyUrl: string, dataUTC: string): { digest: string; canonicalUrl: string; signature: string }`,
  `zbudujNaglowki(fingerprint: string, privateKeyPem: string, deviceModel: string, cialo: string, pelnyUrl: string): Record<string,string>`
  (`cialo` to zawsze string — dla GET przekaż `''`, nigdy `null`, patrz uwaga w kodzie niżej).

To PORT algorytmu z `vulcan-api-js@3.5.4` (funkcje `getDigest`/`getSignatureValue`/
`getEncodedPath`/`getHeadersList`/`getSignatureValues`/nagłówki z `Api.buildHeaders`
w pliku `lib/index.js` tej paczki) — niezależnie zweryfikowany jako identyczny
algorytm w dwóch innych bibliotekach open-source (`hebece`, `iris`) dla tego
samego zaplecza. Używamy `node-forge` (ta sama biblioteka, transitywna zależność
`vulcan-api-js`, już potwierdzona jako działająca w tym środowisku Edge
Function w spike'u z poprzedniej integracji).

- [x] **Krok 1: Napisz `supabase/functions/_wspolne/vulcanPodpis.ts`**

```ts
import forge from 'npm:node-forge@1.3.1'

/**
 * Port algorytmu podpisywania żądań z `vulcan-api-js@3.5.4` (funkcje
 * getDigest/getSignatureValue/getEncodedPath/getHeadersList/getSignatureValues
 * w jej pliku lib/index.js) - ten sam protokół obsługuje zarówno stary Vulcan
 * (Token/Symbol/PIN), jak i eduVULCAN (JWT), bo oba dzielą to samo zaplecze
 * REST. Nie importujemy tych funkcji z vulcan-api-js, bo biblioteka ich nie
 * eksportuje (są prywatne w bundlu) - to wierny port, nie reimplementacja
 * "z pamięci".
 */

function getDigest(cialo: string): string {
  const md = forge.md.sha256.create()
  md.update(cialo, 'utf8')
  return forge.util.encode64(md.digest().bytes())
}

function getEncodedPath(pelnyUrl: string): string {
  const dopasowanie = pelnyUrl.match(/(api\/mobile\/.+)/)
  if (dopasowanie == null) {
    throw new Error('URL nie pasuje do wzorca `(api/mobile/.+)`')
  }
  return encodeURIComponent(dopasowanie[0]).toLowerCase()
}

function getHeadersList(
  digest: string,
  canonicalUrl: string,
  dataUTC: string,
): { headers: string; values: string } {
  // Digest jest ZAWSZE obecny, nawet dla GET bez ciała - prawdziwy klient
  // (vulcan-api-js) podpisuje bezciałowe żądania pustym stringiem `''`, nie
  // `null` (`payload === null ? "" : payload` w jego kodzie), więc zawsze
  // liczy prawdziwy hash (SHA256 pustego stringa) i zawsze dołącza Digest.
  // `cialo` w tym module jest dlatego typu `string`, nigdy `string | null` -
  // wołający przekazuje `''` dla GET, nie `null` (patrz `zbudujNaglowki`).
  const wpisy: Array<[string, string]> = [
    ['vCanonicalUrl', canonicalUrl],
    ['Digest', digest],
    ['vDate', dataUTC],
  ]
  return {
    headers: wpisy.map((w) => w[0]).join(' '),
    values: wpisy.map((w) => w[1]).join(''),
  }
}

function getSignatureValue(wartosci: string, privateKeyPem: string): string {
  const md = forge.md.sha256.create()
  md.update(wartosci, 'utf8')
  const klucz = forge.pki.privateKeyFromPem(
    `-----BEGIN PRIVATE KEY-----\n${privateKeyPem}\n-----END PRIVATE KEY-----`,
  )
  const podpisBajty = (klucz as unknown as { sign: (md: forge.md.MessageDigest) => string }).sign(md)
  return forge.util.encode64(podpisBajty)
}

/** Zwraca digest/canonicalUrl/signature dla jednego żądania - używane wewnętrznie przez `zbudujNaglowki`. */
export function podpiszZadanie(
  fingerprint: string,
  privateKeyPem: string,
  cialo: string,
  pelnyUrl: string,
  dataUTC: string,
): { digest: string; canonicalUrl: string; signature: string } {
  const canonicalUrl = getEncodedPath(pelnyUrl)
  const digest = getDigest(cialo)
  const { headers, values } = getHeadersList(digest, canonicalUrl, dataUTC)
  const wartoscPodpisu = getSignatureValue(values, privateKeyPem)
  return {
    digest: `SHA-256=${digest}`,
    canonicalUrl,
    signature: `keyId="${fingerprint}",headers="${headers}",algorithm="sha256withrsa",signature=Base64(SHA256withRSA(${wartoscPodpisu}))`,
  }
}

/**
 * Komplet nagłówków HTTP dla jednego podpisanego żądania do API Vulcan/eduVULCAN.
 * `cialo` to już zserializowany JSON string - dla GET bez ciała przekaż `''`
 * (pusty string), NIE `null`: prawdziwy klient (vulcan-api-js) zawsze podpisuje
 * i wysyła nagłówek Digest, nawet dla bezciałowych żądań, licząc go z pustego
 * stringa - `null` pominąłby Digest całkowicie, co jest realną, cichą różnicą
 * protokołu (złapane w recenzji Zadania 1, zweryfikowane różnicowym testem
 * względem prawdziwej biblioteki).
 */
export function zbudujNaglowki(
  fingerprint: string,
  privateKeyPem: string,
  deviceModel: string,
  cialo: string,
  pelnyUrl: string,
): Record<string, string> {
  const teraz = new Date()
  const dataUTC = teraz.toUTCString()
  const { digest, canonicalUrl, signature } = podpiszZadanie(fingerprint, privateKeyPem, cialo, pelnyUrl, dataUTC)
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Dart/2.10 (dart:io)',
    vOS: 'Android',
    vDeviceModel: deviceModel,
    vAPI: '1',
    vDate: dataUTC,
    vCanonicalUrl: canonicalUrl,
    Signature: signature,
    Digest: digest,
  }
}
```

- [x] **Krok 2: Napisz `supabase/functions/_wspolne/vulcanPodpis.test.ts`**

Testy tylko na `getEncodedPath` (jedyna czysto tekstowa, deterministyczna
część algorytmu bez klucza kryptograficznego) — reszta wymaga prawdziwej
pary kluczy RSA, co wychodzi poza zakres testu jednostkowego; poprawność
całości weryfikuje żywe wywołanie w Zadaniu 5.

```ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { podpiszZadanie } from './vulcanPodpis.ts'

Deno.test('podpiszZadanie - rzuca dla URL bez segmentu api/mobile', () => {
  assertThrows(
    () => podpiszZadanie('fp', 'klucz', '', 'https://lekcjaplus.vulcan.net.pl/milanowek/inny/segment', 'x'),
    Error,
    'nie pasuje',
  )
})
```

Uruchom: `cd supabase/functions/_wspolne && deno test vulcanPodpis.test.ts`
(jeśli `deno` niedostępne lokalnie, pomiń - `npm test`/`lint`/`build` i tak
nie obejmują plików Deno).

- [x] **Krok 3: Commit**

```bash
git add supabase/functions/_wspolne/vulcanPodpis.ts supabase/functions/_wspolne/vulcanPodpis.test.ts
git commit -m "Vulcan/eduVULCAN: port algorytmu podpisywania zadan

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 2: Rejestracja JWT i lista uczniów w `_wspolne/vulcanApi.ts`

**Pliki:**
- Modyfikacja: `supabase/functions/_wspolne/vulcanApi.ts`

**Interfejsy:**
- Konsumuje: `zbudujNaglowki` z `./vulcanPodpis.ts`.
- Produkuje: `zarejestrujPrzezJwt(keystore: Keystore, jwty: string[]): Promise<Array<{tenant: string; restUrl: string}>>`,
  `pobierzUczniowEdu(keystore: Keystore, konta: Array<{tenant: string; restUrl: string}>): Promise<Student[]>`
  (gdzie zwrócone obiekty `Student` mają dodatkowo `__tenant`/`__restUrl`).
- `zbudujVulcanHebe` zmienia sygnaturę: bierze jawny `restUrl` zamiast czytać
  go z `polaczenie.account`.

- [x] **Krok 1: Zaktualizuj `supabase/functions/_wspolne/vulcanApi.ts`**

Zamień całą zawartość pliku na:

```ts
import { Keystore, Student, VulcanHebe } from 'npm:vulcan-api-js@3.5.4'
import { zbudujNaglowki } from './vulcanPodpis.ts'

const BASE_URL = 'https://lekcjaplus.vulcan.net.pl/'

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
  return new VulcanHebe(keystore, { restUrl } as never)
}

function dekodujJwtPayload(jwt: string): { tenant: string } {
  const czesci = jwt.split('.')
  if (czesci.length !== 3) throw new Error('Nieprawidłowy JWT (oczekiwano 3 segmentów).')
  const uzupelnione = czesci[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(uzupelnione))
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
    const dane = await odpowiedz.json()
    if (!odpowiedz.ok || dane?.Status?.Code < 0) {
      throw new Error(`Rejestracja JWT nie powiodła się dla tenanta ${tenant}: ${JSON.stringify(dane)}`)
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
    const dane = await odpowiedz.json()
    if (!odpowiedz.ok) {
      throw new Error(`Pobranie uczniów nie powiodło się dla tenanta ${tenant}: ${JSON.stringify(dane)}`)
    }
    const surowiUczniowie: unknown[] = dane.Envelope ?? []
    for (const surowy of surowiUczniowie) {
      const uczen = new Student().serialize(surowy) as Student & { __tenant: string; __restUrl: string }
      uczen.__tenant = tenant
      uczen.__restUrl = restUrl
      wszyscyUczniowie.push(uczen)
    }
  }

  return wszyscyUczniowie
}
```

**Uwaga implementacyjna (nie blokuje tego zadania):** dokładny kształt pola
`Status`/`Envelope` w odpowiedziach `api/mobile/register/jwt` i
`api/mobile/register/hebe?mode=2` dla eduVULCAN nie jest w 100% potwierdzony
(oparty na strukturze znanej ze starego Vulcan, gdzie te same nazwy pól
występują) - jeśli w Zadaniu 5 (żywy test) odpowiedź ma inny kształt, popraw
warunek błędu/odczyt `dane.Envelope` w tym pliku na podstawie realnej
odpowiedzi zalogowanej w konsoli.

- [x] **Krok 2: Commit**

```bash
git add supabase/functions/_wspolne/vulcanApi.ts
git commit -m "Vulcan/eduVULCAN: rejestracja przez JWT i pobieranie uczniow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 3: Dopasuj `_wspolne/vulcanSync.ts` do wielu adresów REST

**Pliki:**
- Modyfikacja: `supabase/functions/_wspolne/vulcanSync.ts`

**Interfejsy:**
- Konsumuje: nową sygnaturę `zbudujVulcanHebe(polaczenie, restUrl)` z Zadania 2.

- [x] **Krok 1: Zaktualizuj OBA wywołania `zbudujVulcanHebe` w `vulcanSync.ts`**

Plik ma dziś DWA wywołania tej funkcji (jedno-argumentowe, ze starszej wersji
kodu) - oba trzeba dopasować do nowej, dwuargumentowej sygnatury z Zadania 2.

**Miejsce 1 — `synchronizujDom` (pętla po uczniach):**

Dziś: `vulcan = await zbudujVulcanHebe(polaczenie as WierszPolaczenia)`.
Zamień na:

```ts
const daneUcznia = uczen.student_data as { __restUrl?: string }
if (!daneUcznia.__restUrl) {
  return { ok: false, blad: `Brak zapisanego adresu REST dla ucznia ${uczen.id} - połącz Vulcan ponownie.` }
}
vulcan = await zbudujVulcanHebe(polaczenie as WierszPolaczenia, daneUcznia.__restUrl)
```

**Miejsce 2 — `synchronizujWiadomosci` (jeden „właściciel" skrzynek na cały dom):**

Dziś: `const vulcan = await zbudujVulcanHebe(polaczenie)` (zaraz przed
`await vulcan.selectStudent(wlasciciel.student_data as Student)`). Ten sam
wzorzec, inna nazwa zmiennej ucznia (`wlasciciel`, nie `uczen`):

```ts
const daneWlasciciela = wlasciciel.student_data as { __restUrl?: string }
if (!daneWlasciciela.__restUrl) {
  return { ok: false, blad: `Brak zapisanego adresu REST dla ucznia ${wlasciciel.id} - połącz Vulcan ponownie.` }
}
const vulcan = await zbudujVulcanHebe(polaczenie, daneWlasciciela.__restUrl)
```

(Dokładne nazwy zmiennych/wcięcie w obu miejscach zależą od bieżącego stanu
pliku - przeczytaj go przed edycją, to tylko wzorzec zmiany.) Reszta obu
funkcji (`selectStudent`, pobieranie danych, upsert do tabel) **zostaje bez
zmian** - `Student` z `__restUrl`/`__tenant` nadal ma wszystkie pola, których
`selectStudent` potrzebuje.

- [x] **Krok 2: Sprawdź, że plik nie odwołuje się już nigdzie do starego,
      jednoargumentowego `zbudujVulcanHebe`**

```bash
grep -n "zbudujVulcanHebe" supabase/functions/_wspolne/vulcanSync.ts supabase/functions/vulcan-sync/index.ts
```

Każde wywołanie musi mieć teraz dwa argumenty.

- [x] **Krok 3: Commit**

```bash
git add supabase/functions/_wspolne/vulcanSync.ts
git commit -m "Vulcan/eduVULCAN: wybor adresu REST per uczen w synchronizacji

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 4: Przepisz `vulcan-polacz/index.ts` na rejestrację przez wklejoną treść

**Pliki:**
- Modyfikacja: `supabase/functions/vulcan-polacz/index.ts`

**Interfejsy:**
- Konsumuje: `zarejestrujPrzezJwt`, `pobierzUczniowEdu` z `../_wspolne/vulcanApi.ts`.
- Produkuje: HTTP POST przyjmujący `{ apContent: string }`, reszta kontraktu
  (`{ok:true, liczbaUczniow}` / `{blad}`) bez zmian.

- [x] **Krok 1: Napisz `supabase/functions/vulcan-polacz/index.ts`**

Zastąp całą zawartość pliku:

```ts
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
 * Wyciąga JSON z ukrytego pola `<input id="ap" value="...">` na stronie
 * https://eduvulcan.pl/api/ap (dokładnie ten format - zweryfikowane na żywo
 * przed napisaniem tego kodu). Parsowanie przez regex, nie przez DOM -
 * Deno nie ma wbudowanego parsera HTML, a potrzebujemy tylko jednej wartości
 * atrybutu.
 */
function wyciagnijApJson(apContent: string): Record<string, unknown> {
  const dopasowanie = apContent.match(/id=["']ap["']\s+value=["']([\s\S]*?)["']\s*\/?>/)
  const surowyJson = dopasowanie ? dopasowanie[1] : apContent.trim()
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
```

**Uwaga:** ten sam wzorzec „wycofaj połączenie, jeśli pobranie uczniów się nie
uda" co poprzednio — świadomie zachowany bez zmian logiki, zmienia się tylko
co go poprzedza (rejestracja JWT zamiast Token/Symbol/PIN).

- [x] **Krok 2: Commit**

```bash
git add supabase/functions/vulcan-polacz/index.ts
git commit -m "Vulcan/eduVULCAN: przepisz rejestracje na wklejona tresc /api/ap

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 5: Frontend — jedno pole zamiast Token/Symbol/PIN

**Pliki:**
- Modyfikacja: `src/useVulcan.ts`
- Modyfikacja: `src/MojDom.tsx`
- Modyfikacja: `src/style/formularze.css`

**Interfejsy:**
- Zmienia: `polacz(apContent: string): Promise<boolean>` (było
  `polacz(token, symbol, pin)`).

- [x] **Krok 1: `src/useVulcan.ts`**

Znajdź:

```ts
  const polacz = useCallback(
    async (token: string, symbol: string, pin: string): Promise<boolean> => {
      const { error } = await supabase.functions.invoke('vulcan-polacz', { body: { token, symbol, pin } })
```

Zamień na:

```ts
  const polacz = useCallback(
    async (apContent: string): Promise<boolean> => {
      const { error } = await supabase.functions.invoke('vulcan-polacz', { body: { apContent } })
```

(Reszta funkcji `polacz` bez zmian.)

- [x] **Krok 2: `src/MojDom.tsx` - typ propsa**

Znajdź w `Props['vulcan']`:

```ts
  polacz: (token: string, symbol: string, pin: string) => Promise<boolean>
```

Zamień na:

```ts
  polacz: (apContent: string) => Promise<boolean>
```

- [x] **Krok 3: `src/MojDom.tsx` - komponent `PolaczenieVulcan`**

Znajdź stan i funkcję `polacz`:

```tsx
  const [token, setToken] = useState('')
  const [symbol, setSymbol] = useState('')
  const [pin, setPin] = useState('')
```

i

```tsx
  async function polacz(e: React.FormEvent) {
    e.preventDefault()
    setBladFormularza(null)
    setLaczenie(true)
    const ok = await vulcan.polacz(token.trim(), symbol.trim(), pin.trim())
    setLaczenie(false)
    if (ok) {
      setToken('')
      setSymbol('')
      setPin('')
    }
  }
```

Zamień oba na:

```tsx
  const [apContent, setApContent] = useState('')
```

```tsx
  async function polacz(e: React.FormEvent) {
    e.preventDefault()
    setBladFormularza(null)
    setLaczenie(true)
    const ok = await vulcan.polacz(apContent.trim())
    setLaczenie(false)
    if (ok) setApContent('')
  }
```

- [x] **Krok 4: `src/MojDom.tsx` - formularz JSX**

Znajdź blok formularza (opis + trzy pola + przycisk):

```tsx
          <p className="panel-dzien">
            Połącz konto Vulcan rodzica, żeby widzieć plan lekcji, sprawdziany,
            zadania domowe i wiadomości dzieci w zakładce „Szkoła". Token,
            Symbol i PIN wygenerujesz w oficjalnej aplikacji Vulcan (Dostęp
            Mobilny) — są jednorazowe.
          </p>
          <form className="formularz formularz-vulcan" onSubmit={(e) => void polacz(e)}>
            <label htmlFor="vulcan-token">Token</label>
            <input id="vulcan-token" value={token} onChange={(e) => setToken(e.target.value)} maxLength={10} />

            <label htmlFor="vulcan-symbol">Symbol</label>
            <input id="vulcan-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} />

            <label htmlFor="vulcan-pin">PIN</label>
            <input id="vulcan-pin" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={8} />

            {bladFormularza && (
              <p className="blad" role="alert">
                {bladFormularza}
              </p>
            )}

            <button type="submit" disabled={laczenie || !token.trim() || !symbol.trim() || !pin.trim()}>
              {laczenie ? 'Łączę…' : 'Połącz'}
            </button>
          </form>
```

Zamień na:

```tsx
          <ol className="instrukcja-vulcan">
            <li>
              Zaloguj się na{' '}
              <a href="https://eduvulcan.pl" target="_blank" rel="noreferrer">
                eduvulcan.pl
              </a>{' '}
              (tak jak zwykle).
            </li>
            <li>
              W tej samej, zalogowanej karcie wejdź na{' '}
              <a href="https://eduvulcan.pl/api/ap" target="_blank" rel="noreferrer">
                eduvulcan.pl/api/ap
              </a>
              .
            </li>
            <li>Zaznacz i skopiuj całą zawartość tej strony (Ctrl+A, Ctrl+C).</li>
            <li>Wklej ją poniżej i kliknij „Połącz".</li>
          </ol>
          <form className="formularz formularz-vulcan" onSubmit={(e) => void polacz(e)}>
            <label htmlFor="vulcan-ap-content">Zawartość strony eduvulcan.pl/api/ap</label>
            <textarea
              id="vulcan-ap-content"
              value={apContent}
              onChange={(e) => setApContent(e.target.value)}
              rows={4}
              placeholder="Wklej tutaj..."
            />

            {bladFormularza && (
              <p className="blad" role="alert">
                {bladFormularza}
              </p>
            )}

            <button type="submit" disabled={laczenie || !apContent.trim()}>
              {laczenie ? 'Łączę…' : 'Połącz'}
            </button>
          </form>
```

- [x] **Krok 5: `src/style/formularze.css`**

Znajdź:

```css
.formularz-vulcan {
  max-width: 320px;
}
```

Zamień na:

```css
.formularz-vulcan {
  max-width: 480px;
}

.formularz-vulcan textarea {
  padding: 10px 12px;
  border: 1px solid var(--kreska);
  border-radius: 10px;
  background: var(--karta);
  color: var(--tekst);
  font: inherit;
  font-size: 13px;
  font-family: monospace;
  resize: vertical;
}

.instrukcja-vulcan {
  margin: 0 0 14px;
  padding-left: 20px;
  font-size: 14px;
  color: var(--tekst-drugi);
  line-height: 1.6;
}
```

- [x] **Krok 6: Testy, lint, build**

```bash
npm test -- --run
npm run lint
npm run build
```

Wszystko musi przejść czysto.

- [x] **Krok 7: Commit**

```bash
git add src/useVulcan.ts src/MojDom.tsx src/style/formularze.css
git commit -m "Vulcan/eduVULCAN: formularz wklejenia tresci zamiast Token/Symbol/PIN

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Zadanie 6: Wdrożenie i pierwszy prawdziwy test

**Pliki:**
- Brak zmian w repo poza ewentualnymi poprawkami wynikłymi z testu na żywo.

- [x] **Krok 1: Wdróż obie zmienione funkcje**

```bash
supabase functions deploy vulcan-polacz --project-ref fqviwnzinpndyprcovxw
supabase functions deploy vulcan-sync --project-ref fqviwnzinpndyprcovxw
```

- [x] **Krok 2: Poinformuj kontrolera/użytkownika, że kod jest gotowy do
      żywego testu**

To zadanie KOŃCZY SIĘ tutaj dla subagenta — rzeczywiste zalogowanie na
`eduvulcan.pl` i wklejenie treści `/api/ap` może wykonać wyłącznie
użytkownik (wymaga jego prawdziwego hasła). Napisz w raporcie: „Kod wdrożony,
gotowy do testu przez użytkownika" i zwróć status `DONE_WITH_CONCERNS` z
dokładnym opisem, co użytkownik powinien zrobić (te same 4 kroki co w
instrukcji UI z Zadania 5).

**Nie zgaduj wyniku żywego testu. Nie zamykaj tego zadania jako w pełni
zweryfikowane, dopóki kontroler nie potwierdzi realnego przebiegu z
użytkownikiem.**

### Checklista rzeczy do sprawdzenia/poprawienia, jeśli żywy test się nie powiedzie

Te elementy `zarejestrujPrzejJwt`/`pobierzUczniowEdu` (Zadanie 2) są oparte
na znanym kształcie starego protokołu Vulcan, nie na potwierdzonej,
żywej odpowiedzi eduVULCAN — jeśli rejestracja/pobranie uczniów zwróci błąd
albo dziwny wynik, sprawdź po kolei (od najbardziej prawdopodobnego):

1. Dokładny kształt odpowiedzi `POST api/mobile/register/jwt` i
   `GET api/mobile/register/hebe?mode=2` — zaloguj surową treść odpowiedzi
   (`console.log` w Edge Function, potem `supabase functions logs`) i
   porównaj z założeniami w kodzie (`Status.Code`, `Envelope`).
2. `Timestamp`/`TimestampFormatted` w ciele `register/jwt` — dziś sekundy
   Unix + ISO UTC; `vulcan-api-js` dla STAREGO endpointu używa milisekund
   (`Date.now()`) i lokalnego formatu `moment().format('YYYY-MM-DD HH:mm:ss')`
   - jeśli serwer odrzuca żądanie z powodu znacznika czasu, spróbuj tej
   konwencji.
3. `selfIdentifier: crypto.randomUUID()` (losowy, jak w `hebece`) vs.
   deterministyczny `uuid5(fingerprint)` używany przez `vulcan-api-js` dla
   STAREGO endpointu — jeśli powtórna rejestracja tego samego urządzenia
   jest odrzucana albo tworzy duplikaty, to pierwsze podejrzane miejsce.
4. Brakujące pola w Envelope względem starego protokołu: `CertificateId`
   (obecne w `vulcan-api-js`, pominięte tu) i `FirebaseToken` (`hebece`
   wysyła `NotificationToken: ''` zamiast tego pola) - jeśli serwer wymaga
   któregoś z nich, dodaj.
