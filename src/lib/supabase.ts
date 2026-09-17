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
  /** Czy ta osoba chce porannego podsumowania mailem. */
  digest_enabled: boolean
  /** O której, czasu polskiego. Format kolumny `time`: 'GG:MM:SS'. */
  digest_at: string
  /** Chat_id Telegrama po sparowaniu - null, dopóki domownik nie połączy konta. */
  telegram_chat_id: number | null
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

/** Notatka na tablicy rodzinnej. */
export type NotatkaDb = {
  id: string
  household_id: string
  content: string
  pinned: boolean
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

/** Termin w tabeli deadlines. */
export type TerminDb = {
  id: string
  household_id: string
  title: string
  description: string | null
  due_date: string
  completed: boolean
  completed_at: string | null
  /** Data, kiedy przypomnieć o terminie - na razie tylko przechowywana, bez żadnej akcji. */
  notify_date: string | null
  created_by: string | null
  created_at: string
}

/** Zalacznik do terminu w tabeli deadline_attachments. */
export type ZalacznikDb = {
  id: string
  deadline_id: string
  storage_path: string
  file_name: string
  content_type: string
  size_bytes: number
  created_by: string | null
  created_at: string
}

export type UczenDb = {
  id: string
  household_id: string
  vulcan_id: string
  first_name: string
  last_name: string
  class_name: string | null
  member_id: string | null
  created_at: string
}

export type LekcjaDb = {
  id: string
  student_id: string
  household_id: string
  lesson_date: string
  start_time: string
  end_time: string
  subject: string
  teacher: string | null
  room: string | null
  changed: boolean
  change_note: string | null
  created_at: string
}

/** Paczka InPost w tabeli inpost_parcels. */
export type PaczkaDb = {
  id: string
  household_id: string
  member_id: string
  shipment_number: string
  status: string
  sender_name: string | null
  point_name: string | null
  point_address: string | null
  expiry_date: string | null
  stored_date: string | null
  updated_at: string
}

export type WpisDb = {
  id: string
  student_id: string
  household_id: string
  kind: 'sprawdzian' | 'zadanie_domowe'
  due_date: string
  subject: string
  description: string | null
  vulcan_key: string
  created_at: string
}

export type WiadomoscDb = {
  id: string
  student_id: string
  household_id: string
  sender: string
  subject: string
  content: string
  sent_at: string
  vulcan_key: string
  created_at: string
}

export type ObecnoscDb = {
  id: string
  student_id: string
  household_id: string
  attendance_date: string
  subject: string
  presence_name: string
  absence: boolean
  justified: boolean
  exemption: boolean
  vulcan_key: string
  created_at: string
}
