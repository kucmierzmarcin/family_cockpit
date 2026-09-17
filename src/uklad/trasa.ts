import { klucz } from '../dates'
import { EKRANY, SLUGI, type Ekran } from './nawigacja'
// Sam typ, nie kod - import znika po kompilacji, więc ten czysty moduł nie
// wciąga komponentu (ani Reacta) do testów.
import type { Widok } from '../widoki/SterowanieKalendarza'

/** Co niesie adres: który ekran, a dla kalendarza także jego widok i datę. */
export type Trasa = {
  ekran: Ekran
  widok: Widok
  kotwica: Date
}

const EKRAN_STARTOWY: Ekran = 'dashboard'
const WIDOK_DOMYSLNY: Widok = 'miesiac'
const WIDOKI: Widok[] = ['miesiac', 'tydzien', 'dzien']

const EKRAN_PO_SLUGU = new Map<string, Ekran>(EKRANY.map((e) => [SLUGI[e], e]))

const WZOR_DATY = /^\d{4}-\d{2}-\d{2}$/

/**
 * 'RRRR-MM-DD' na datę lokalną, albo `null`, gdy tekst nie jest prawdziwym dniem.
 *
 * Południe, nie północ - tę samą sztuczkę stosuje App.tsx przy wyborze dnia w
 * siatce. O północy zmiana czasu letniego potrafi przesunąć datę o dzień;
 * w środku doby nic jej nie ruszy.
 *
 * Porównanie przez `klucz` odrzuca daty, których nie ma w kalendarzu: samo
 * sprawdzenie „czy Date jest poprawna" nie wystarcza, bo część silników
 * przewija 31 lutego na 2 albo 3 marca zamiast odmówić.
 */
function dataZTekstu(tekst: string | undefined): Date | null {
  if (!tekst || !WZOR_DATY.test(tekst)) return null
  const data = new Date(`${tekst}T12:00:00`)
  if (Number.isNaN(data.getTime())) return null
  return klucz(data) === tekst ? data : null
}

/**
 * Adres na trasę. Nigdy nie rzuca i nigdy nie zwraca pustki - każdy śmieć
 * schodzi do najbliższej sensownej wartości, bo adres pisze użytkownik (albo
 * stara zakładka) i nie ma powodu karać go białym ekranem.
 *
 * `teraz` jest parametrem, a nie `new Date()` w środku - dzięki temu funkcja
 * jest czysta i daje się przetestować bez zamrażania zegara.
 */
export function trasaZTekstu(hash: string, teraz: Date): Trasa {
  const czesci = hash.replace(/^#/, '').split('/').filter(Boolean)

  const ekran = EKRAN_PO_SLUGU.get(czesci[0] ?? '') ?? EKRAN_STARTOWY

  // Widok i data mają sens wyłącznie w kalendarzu. Gdyby je czytać wszędzie,
  // `#/zakupy/tydzien/...` byłoby adresem legalnym, a nie jest.
  if (ekran !== 'kalendarz') {
    return { ekran, widok: WIDOK_DOMYSLNY, kotwica: teraz }
  }

  const kandydat = czesci[1] as Widok | undefined
  const widok = kandydat && WIDOKI.includes(kandydat) ? kandydat : WIDOK_DOMYSLNY

  return { ekran, widok, kotwica: dataZTekstu(czesci[2]) ?? teraz }
}

/**
 * Trasa na adres. Poza kalendarzem widok i data nie trafiają do adresu -
 * `#/zakupy` nie ma powodu nieść stanu kalendarza.
 */
export function tekstZTrasy(trasa: Trasa): string {
  const slug = SLUGI[trasa.ekran]
  if (trasa.ekran !== 'kalendarz') return `#/${slug}`
  return `#/${slug}/${trasa.widok}/${klucz(trasa.kotwica)}`
}
