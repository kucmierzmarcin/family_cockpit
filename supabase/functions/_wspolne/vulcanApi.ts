import { Keystore, VulcanHebe } from 'npm:vulcan-api-js@3.5.4'

/** Wiersz `vulcan_connections` - dokładnie te kolumny, których potrzebuje ta warstwa. */
export type WierszPolaczenia = {
  certificate: string
  fingerprint: string
  private_key: string
  firebase_token: string | null
  device_model: string
  account: unknown
}

/**
 * Odtwarza klienta Vulcan z zapisanych poświadczeń. `Keystore`/`Account` w
 * bibliotece to zwykłe obiekty danych (klasa `Serializable` bez zachowania) -
 * odtworzenie ich jako plain object wystarcza, biblioteka i tak tylko czyta
 * z nich pola (potwierdzone w kodzie `selectStudent`/`Api` samej paczki).
 */
export async function zbudujVulcanHebe(polaczenie: WierszPolaczenia): Promise<VulcanHebe> {
  const keystore = new Keystore()
  keystore.loadFromObject({
    certificate: polaczenie.certificate,
    fingerprint: polaczenie.fingerprint,
    privateKey: polaczenie.private_key,
    firebaseToken: polaczenie.firebase_token ?? '',
    deviceModel: polaczenie.device_model,
  })
  return new VulcanHebe(keystore, polaczenie.account as never)
}
