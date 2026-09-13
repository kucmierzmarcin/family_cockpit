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
        `Rejestracja JWT nie powiodła się dla tenanta ${tenant}: HTTP ${odpowiedz.status}, ${JSON.stringify(dane)}`,
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
        `Pobranie uczniów nie powiodło się dla tenanta ${tenant}: HTTP ${odpowiedz.status}, ${JSON.stringify(dane)}`,
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
      const uczen = new Student().serialize(surowy) as Student & { __tenant: string; __restUrl: string }
      uczen.__tenant = tenant
      uczen.__restUrl = restUrl
      wszyscyUczniowie.push(uczen)
    }
  }

  return wszyscyUczniowie
}
