import { minutyOdPolnocy, type Przedzial } from '../czas'

const DOMYSLNA_GODZINA_OD = 6
const DOMYSLNA_GODZINA_DO = 23
const MINUT_W_DOBIE = 24 * 60

/**
 * Okno godzin do pokazania w poziomym grafiku dnia: domyślnie 6-23,
 * rozszerzane, gdy któreś wydarzenie wykracza poza ten zakres - tak jak
 * `wypelnijOkno` w `SiatkaGodzin.tsx`, tylko jako samodzielna, testowalna
 * funkcja (grafik dnia ma inny układ osi niż siatka godzin).
 */
export function zakresGodzin(wydarzenia: Przedzial[]): { godzinaOd: number; godzinaDo: number } {
  let godzinaOd = DOMYSLNA_GODZINA_OD
  let godzinaDo = DOMYSLNA_GODZINA_DO

  for (const w of wydarzenia) {
    const odMinut = minutyOdPolnocy(w.start)
    const doMinut = minutyOdPolnocy(w.koniec) || MINUT_W_DOBIE
    godzinaOd = Math.min(godzinaOd, Math.floor(odMinut / 60))
    godzinaDo = Math.max(godzinaDo, Math.ceil(doMinut / 60))
  }

  return { godzinaOd, godzinaDo }
}
