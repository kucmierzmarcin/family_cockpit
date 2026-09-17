import type { LekcjaDb, ObecnoscDb, UczenDb, WiadomoscDb, WpisDb } from './lib/supabase'
import { zloz } from './czas'
import type { Wydarzenie } from './useWydarzenia'

export type Uczen = {
  id: string
  imie: string
  nazwisko: string
  klasa: string | null
  memberId: string | null
}

export type Lekcja = {
  id: string
  uczenId: string
  data: string
  od: string
  do: string
  przedmiot: string
  nauczyciel: string | null
  sala: string | null
  zmieniona: boolean
  opisZmiany: string | null
}

export type Wpis = {
  id: string
  uczenId: string
  typ: 'sprawdzian' | 'zadanie_domowe'
  data: string
  przedmiot: string
  opis: string | null
}

export type Wiadomosc = {
  id: string
  uczenId: string
  nadawca: string
  temat: string
  tresc: string
  data: string
}

export type Obecnosc = {
  id: string
  uczenId: string
  data: string
  przedmiot: string
  /** Nazwa typu z Vulcan, np. "Nieobecność nieusprawiedliwiona" - do wyświetlenia wprost. */
  nazwaTypu: string
  nieobecnosc: boolean
  usprawiedliwiona: boolean
  /** Zwolnienie (np. lekarskie) - osobna kategoria niż zwykłe usprawiedliwienie. */
  zwolnienie: boolean
}

export type StatusPolaczenia = {
  istnieje: boolean
  status: 'aktywne' | 'wymaga_ponownej_rejestracji' | null
  godzinySync: string[]
  polaczylImie: string | null
  ostatniBlad: string | null
  uczniowie: Uczen[]
}

export function uczenZBazy(u: UczenDb): Uczen {
  return {
    id: u.id,
    imie: u.first_name,
    nazwisko: u.last_name,
    klasa: u.class_name,
    memberId: u.member_id,
  }
}

export function lekcjaZBazy(l: LekcjaDb): Lekcja {
  return {
    id: l.id,
    uczenId: l.student_id,
    data: l.lesson_date,
    od: l.start_time.slice(0, 5),
    do: l.end_time.slice(0, 5),
    przedmiot: l.subject,
    nauczyciel: l.teacher,
    sala: l.room,
    zmieniona: l.changed,
    opisZmiany: l.change_note,
  }
}

export function wpisZBazy(w: WpisDb): Wpis {
  return {
    id: w.id,
    uczenId: w.student_id,
    typ: w.kind,
    data: w.due_date,
    przedmiot: w.subject,
    opis: w.description,
  }
}

export function wiadomoscZBazy(m: WiadomoscDb): Wiadomosc {
  return {
    id: m.id,
    uczenId: m.student_id,
    nadawca: m.sender,
    temat: m.subject,
    tresc: m.content,
    data: m.sent_at,
  }
}

export function obecnoscZBazy(o: ObecnoscDb): Obecnosc {
  return {
    id: o.id,
    uczenId: o.student_id,
    data: o.attendance_date,
    przedmiot: o.subject,
    nazwaTypu: o.presence_name,
    nieobecnosc: o.absence,
    usprawiedliwiona: o.justified,
    zwolnienie: o.exemption,
  }
}

/** Nieobecnosc, ktorej nikt jeszcze nie usprawiedliwil ani nie zwolnil z niej ucznia. */
export function czyNieusprawiedliwiona(o: Obecnosc): boolean {
  return o.nieobecnosc && !o.usprawiedliwiona && !o.zwolnienie
}

/** Nieobecnosci od najnowszej. */
export function posortujObecnosci<T extends { data: string }>(obecnosci: T[]): T[] {
  return [...obecnosci].sort((a, b) => b.data.localeCompare(a.data))
}

/** Lekcje posortowane chronologicznie w obrębie dnia. */
export function posortujLekcje<T extends { data: string; od: string }>(lekcje: T[]): T[] {
  return [...lekcje].sort((a, b) => (a.data === b.data ? a.od.localeCompare(b.od) : a.data.localeCompare(b.data)))
}

/** Lekcje pogrupowane po dacie (`RRRR-MM-DD`), każda grupa już posortowana godzinami. */
export function pogrupujLekcjePoDniu(lekcje: Lekcja[]): Map<string, Lekcja[]> {
  const posortowane = posortujLekcje(lekcje)
  const grupy = new Map<string, Lekcja[]>()
  for (const l of posortowane) {
    const grupa = grupy.get(l.data) ?? []
    grupa.push(l)
    grupy.set(l.data, grupa)
  }
  return grupy
}

/**
 * Syntetyczne "wydarzenia" reprezentujące cały dzień szkolny (od pierwszej do
 * ostatniej lekcji) - jeden blok na ucznia i dzień, bez pojedynczych lekcji.
 * Nie istnieją w tabeli `events` - kalendarz odróżnia je polem `blokSzkolny`,
 * żeby kliknięcie nie próbowało ich edytować/kasować jak prawdziwe wydarzenie.
 */
export function blokiSzkolne(lekcje: Lekcja[], uczniowie: Uczen[]): Wydarzenie[] {
  const uczenPoId = new Map(uczniowie.map((u) => [u.id, u]))
  const grupy = new Map<string, Lekcja[]>()
  for (const l of lekcje) {
    if (!uczenPoId.has(l.uczenId)) continue
    const klucz = `${l.uczenId}|${l.data}`
    grupy.set(klucz, [...(grupy.get(klucz) ?? []), l])
  }

  const bloki: Wydarzenie[] = []
  for (const [klucz, grupa] of grupy) {
    const uczen = uczenPoId.get(grupa[0].uczenId)!
    const posortowane = posortujLekcje(grupa)
    const pierwsza = posortowane[0]
    const ostatnia = posortowane.reduce((akt, l) => (l.do > akt.do ? l : akt), pierwsza)

    bloki.push({
      id: `szkola-${klucz}`,
      tytul: `Szkoła — ${uczen.imie}`,
      start: zloz(pierwsza.data, pierwsza.od),
      koniec: zloz(pierwsza.data, ostatnia.do),
      calodniowe: false,
      seriaId: null,
      osobyId: uczen.memberId ? [uczen.memberId] : [],
      autorId: null,
      blokSzkolny: true,
    })
  }
  return bloki
}

/** Sprawdziany i zadania domowe chronologicznie, najbliższe pierwsze. */
export function posortujWpisy<T extends { data: string }>(wpisy: T[]): T[] {
  return [...wpisy].sort((a, b) => a.data.localeCompare(b.data))
}

/** Wiadomości od najnowszej. */
export function posortujWiadomosci<T extends { data: string }>(wiadomosci: T[]): T[] {
  return [...wiadomosci].sort((a, b) => b.data.localeCompare(a.data))
}

/**
 * Treść wiadomości z Vulcan przychodzi jako HTML (nauczyciele piszą w edytorze
 * z formatowaniem) - zamieniamy ją na czysty tekst do wyświetlenia, zamiast
 * pokazywać znaczniki wprost. Zamierzenie: CZYTELNOŚĆ, nie bezpieczne
 * renderowanie HTML-a (stąd zwykły tekst, nie `dangerouslySetInnerHTML`) -
 * nie ma potrzeby ufać formatowaniu treści, którą wysłał ktoś inny.
 */
export function oczyscTrescWiadomosci(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const WZORZEC_GODZINY = /^([01]\d|2[0-3]):[0-5]\d$/
export const MAKS_GODZIN_SYNC = 3

/** Komunikat błędu dla `godziny`, albo `null` gdy poprawne (format `HH:MM`,
 * bez duplikatów, maksymalnie `MAKS_GODZIN_SYNC` wpisów).
 *
 * Pusta lista jest POPRAWNA - oznacza wyłączoną automatyczną synchronizację.
 * Bez tego nie dałoby się jej wyłączyć z UI po wcześniejszym włączeniu. */
export function bladGodzinySync(godziny: string[]): string | null {
  if (godziny.length === 0) return null
  if (godziny.length > MAKS_GODZIN_SYNC) return `Maksymalnie ${MAKS_GODZIN_SYNC} godziny dziennie.`
  if (new Set(godziny).size !== godziny.length) return 'Ta sama godzina podana dwa razy.'
  if (!godziny.every((g) => WZORZEC_GODZINY.test(g))) return 'Nieprawidłowy format godziny.'
  return null
}
