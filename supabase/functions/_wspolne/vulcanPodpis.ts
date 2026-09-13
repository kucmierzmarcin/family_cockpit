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

function getDigest(cialo: string | null): string {
  if (cialo == null) return ''
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
  cialo: string | null,
  digest: string,
  canonicalUrl: string,
  dataUTC: string,
): { headers: string; values: string } {
  const wpisy: Array<[string, string]> = [['vCanonicalUrl', canonicalUrl]]
  if (cialo != null) wpisy.push(['Digest', digest])
  wpisy.push(['vDate', dataUTC])
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
  cialo: string | null,
  pelnyUrl: string,
  dataUTC: string,
): { digest: string; canonicalUrl: string; signature: string } {
  const canonicalUrl = getEncodedPath(pelnyUrl)
  const digest = getDigest(cialo)
  const { headers, values } = getHeadersList(cialo, digest, canonicalUrl, dataUTC)
  const wartoscPodpisu = getSignatureValue(values, privateKeyPem)
  return {
    digest: `SHA-256=${digest}`,
    canonicalUrl,
    signature: `keyId="${fingerprint}",headers="${headers}",algorithm="sha256withrsa",signature=Base64(SHA256withRSA(${wartoscPodpisu}))`,
  }
}

/**
 * Komplet nagłówków HTTP dla jednego podpisanego żądania do API Vulcan/eduVULCAN.
 * `cialo` to już zserializowany JSON string (albo `null` dla GET bez ciała).
 */
export function zbudujNaglowki(
  fingerprint: string,
  privateKeyPem: string,
  deviceModel: string,
  cialo: string | null,
  pelnyUrl: string,
): Record<string, string> {
  const teraz = new Date()
  const dataUTC = teraz.toUTCString()
  const { digest, canonicalUrl, signature } = podpiszZadanie(fingerprint, privateKeyPem, cialo, pelnyUrl, dataUTC)
  const naglowki: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Dart/3.3 (dart:io)',
    vOS: 'Android',
    vDeviceModel: deviceModel,
    vAPI: '1',
    vDate: dataUTC,
    vCanonicalUrl: canonicalUrl,
    Signature: signature,
  }
  if (cialo != null) naglowki['Digest'] = digest
  return naglowki
}
