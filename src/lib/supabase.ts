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

/** Jedno wydarzenie w kalendarzu, tak jak leży w tabeli `events`. */
export type WydarzenieDb = {
  id: string
  title: string
  event_date: string // 'RRRR-MM-DD'
  event_time: string | null // 'GG:MM:SS'
  created_at: string
}
