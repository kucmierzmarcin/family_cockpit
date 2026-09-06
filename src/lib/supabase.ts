import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Brakuje danych Supabase. Utwórz plik .env na podstawie .env.example ' +
      'i uzupełnij VITE_SUPABASE_URL oraz VITE_SUPABASE_PUBLISHABLE_KEY.',
  )
}

export const supabase = createClient(url, key)

/** Rola domownika - decyduje, co wolno mu w aplikacji i w bazie. */
export type Rola = 'rodzic' | 'domownik' | 'dziecko'

export const OPISY_ROL: Record<Rola, string> = {
  rodzic: 'Rodzic',
  domownik: 'Domownik',
  dziecko: 'Dziecko',
}

/**
 * Jedno wydarzenie tak, jak leży w tabeli `events`.
 * `starts_at` i `ends_at` to kolumny `timestamp` bez strefy - czytaj je
 * przez `zTimestampu` z src/czas.ts, nigdy przez `new Date(...)` wprost.
 */
export type WydarzenieDb = {
  id: string
  title: string
  starts_at: string // 'RRRR-MM-DDTGG:MM:SS'
  ends_at: string // wyłączny - wydarzenie trwa do tej chwili, ale jej nie obejmuje
  all_day: boolean
  series_id: string | null // wspólne dla wystąpień jednej serii
  household_id: string
  created_by: string | null // kto dodał wpis
  created_at: string
  /** Przypisane osoby - z tabeli łączącej `event_members`. */
  event_members?: { member_id: string }[]
}

/**
 * Jeden domownik w tabeli `members`. Łączy profil w kalendarzu (imię, kolor)
 * z przynależnością do domu (rola, konto). Puste `user_id` i `email` oznaczają
 * osobę bez konta - np. małe dziecko, które się nie loguje.
 */
export type DomownikDb = {
  id: string
  household_id: string
  name: string
  color: string // id koloru z palety, patrz src/kolory.ts
  role: Rola
  user_id: string | null
  email: string | null
  created_at: string
}

/** Lista zakupów w tabeli `shopping_lists`. */
export type ListaDb = {
  id: string
  household_id: string
  name: string
  created_at: string
}

/** Pozycja listy zakupów. `quantity` to tekst: "2 l", "10 szt.", "pół kg". */
export type PozycjaDb = {
  id: string
  list_id: string
  name: string
  quantity: string | null
  done: boolean
  created_by: string | null
  created_at: string
}

/** Gospodarstwo domowe - wszystkie dane należą do dokładnie jednego. */
export type DomDb = {
  id: string
  name: string
  created_at: string
}

/** Stan konta przypisanego do osoby - do pokazania na ekranie "Mój dom". */
export function stanKonta(d: DomownikDb): 'polaczone' | 'czeka' | 'brak' {
  if (d.user_id) return 'polaczone'
  return d.email ? 'czeka' : 'brak'
}
