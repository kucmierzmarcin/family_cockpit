import type { LekcjaDb, UczenDb, WiadomoscDb, WpisDb } from './lib/supabase'

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

/** Sprawdziany i zadania domowe chronologicznie, najbliższe pierwsze. */
export function posortujWpisy<T extends { data: string }>(wpisy: T[]): T[] {
  return [...wpisy].sort((a, b) => a.data.localeCompare(b.data))
}

/** Wiadomości od najnowszej. */
export function posortujWiadomosci<T extends { data: string }>(wiadomosci: T[]): T[] {
  return [...wiadomosci].sort((a, b) => b.data.localeCompare(a.data))
}

const WZORZEC_GODZINY = /^([01]\d|2[0-3]):[0-5]\d$/
export const MAKS_GODZIN_SYNC = 3

/** Komunikat błędu dla `godziny`, albo `null` gdy poprawne (format `HH:MM`,
 * bez duplikatów, maksymalnie `MAKS_GODZIN_SYNC` wpisów). */
export function bladGodzinySync(godziny: string[]): string | null {
  if (godziny.length === 0) return 'Podaj przynajmniej jedną godzinę.'
  if (godziny.length > MAKS_GODZIN_SYNC) return `Maksymalnie ${MAKS_GODZIN_SYNC} godziny dziennie.`
  if (new Set(godziny).size !== godziny.length) return 'Ta sama godzina podana dwa razy.'
  if (!godziny.every((g) => WZORZEC_GODZINY.test(g))) return 'Nieprawidłowy format godziny.'
  return null
}
