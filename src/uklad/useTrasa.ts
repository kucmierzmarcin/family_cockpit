import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { tekstZTrasy, trasaZTekstu, type Trasa } from './trasa'
import type { Ekran } from './nawigacja'
import type { Widok } from '../widoki/SterowanieKalendarza'

/**
 * Własni słuchacze obok `hashchange`.
 *
 * `history.replaceState` NIE wywołuje `hashchange` - to nie jest przeoczenie
 * przeglądarki, tylko specyfikacja. Bez tej listy przesunięcie miesiąca
 * strzałką (które celowo podmienia wpis, zamiast dokładać nowy) zmieniłoby
 * adres, ale nie obudziłoby Reacta.
 */
const sluchacze = new Set<() => void>()

function subskrybuj(zmiana: () => void): () => void {
  sluchacze.add(zmiana)
  window.addEventListener('hashchange', zmiana)
  return () => {
    sluchacze.delete(zmiana)
    window.removeEventListener('hashchange', zmiana)
  }
}

function czytajHash(): string {
  return window.location.hash
}

/**
 * Zapisuje adres i budzi subskrybentów.
 *
 * `zastap` decyduje, czy powstaje nowy wpis w historii. Przesuwanie daty
 * strzałkami podmienia wpis - inaczej przewinięcie roku wpycha kilkanaście
 * wpisów i „Wstecz" przestaje znaczyć „poprzedni ekran".
 */
function przejdz(tekst: string, zastap: boolean): void {
  if (window.location.hash === tekst) return

  if (zastap) {
    window.history.replaceState(null, '', tekst)
    for (const zmiana of sluchacze) zmiana()
  } else {
    // Przypisanie do `location.hash` samo dokłada wpis do historii i wywołuje
    // `hashchange`, więc tu nie ma czego budzić ręcznie.
    window.location.hash = tekst
  }
}

export type Nawigacja = Trasa & {
  /** Zmiana ekranu - nowy wpis w historii, żeby „Wstecz" wracał na poprzedni. */
  idzDoEkranu: (e: Ekran) => void
  /**
   * Zmiana zakresu kalendarza - też nawigacja, więc też nowy wpis.
   *
   * Data jest tu opcjonalna, bo klik w dzień zmienia oba naraz. Dwa osobne
   * wywołania nie załatwiłyby sprawy: obliczyłyby się z tej samej, jeszcze
   * nieodswieżonej trasy i drugie nadpisałoby pierwsze.
   */
  ustawWidok: (w: Widok, kotwica?: Date) => void
  /** Przesunięcie daty - podmienia wpis, patrz `przejdz`. */
  ustawKotwice: (d: Date) => void
}

/**
 * Adres jest jedynym źródłem prawdy dla ekranu, widoku kalendarza i daty
 * odniesienia. Nie ma kopii tych wartości w `useState`, więc nie ma czego
 * synchronizować i nie ma jak się rozjechać - „Wstecz", odświeżenie i wklejony
 * link prowadzą dokładnie tam, co adres.
 */
export function useTrasa(): Nawigacja {
  const hash = useSyncExternalStore(subskrybuj, czytajHash)

  // Zależność tylko od tekstu adresu: `new Date()` w środku liczy się wtedy raz
  // na zmianę adresu, a nie przy każdym renderze (inaczej `kotwica` byłaby za
  // każdym razem nowym obiektem i psuła memoizację w App.tsx).
  const trasa = useMemo(() => trasaZTekstu(hash, new Date()), [hash])

  // Adres wpisany ręcznie albo ze starej zakładki („#/kalendarz", „#/", śmieć)
  // sprowadzamy do postaci kanonicznej. Podmiana, nie dopisanie - inaczej
  // pierwsze „Wstecz" wracałoby na ten sam ekran pod brzydszym adresem.
  useEffect(() => {
    const kanoniczny = tekstZTrasy(trasa)
    if (window.location.hash !== kanoniczny) {
      window.history.replaceState(null, '', kanoniczny)
    }
  }, [trasa])

  // Gdzie kalendarz stał, zanim poszliśmy na zakupy. Adres „#/zakupy" celowo
  // nie niesie stanu kalendarza, więc bez tej pamięci powrót na zakładkę
  // kalendarza lądowałby zawsze na bieżącym miesiącu - a dziś, przed
  // routingiem, kalendarz pamięta swoje miejsce przez całą sesję.
  const ostatniKalendarz = useRef<{ widok: Widok; kotwica: Date } | null>(null)
  useEffect(() => {
    if (trasa.ekran === 'kalendarz') {
      ostatniKalendarz.current = { widok: trasa.widok, kotwica: trasa.kotwica }
    }
  }, [trasa])

  const idzDoEkranu = useCallback((e: Ekran) => {
    const zapamietany = ostatniKalendarz.current
    const docelowa: Trasa =
      e === 'kalendarz' && zapamietany
        ? { ekran: e, ...zapamietany }
        : { ekran: e, widok: 'miesiac', kotwica: new Date() }
    przejdz(tekstZTrasy(docelowa), false)
  }, [])

  const ustawWidok = useCallback(
    (w: Widok, kotwica?: Date) =>
      przejdz(tekstZTrasy({ ...trasa, widok: w, kotwica: kotwica ?? trasa.kotwica }), false),
    [trasa],
  )

  const ustawKotwice = useCallback(
    (d: Date) => przejdz(tekstZTrasy({ ...trasa, kotwica: d }), true),
    [trasa],
  )

  return { ...trasa, idzDoEkranu, ustawWidok, ustawKotwice }
}
