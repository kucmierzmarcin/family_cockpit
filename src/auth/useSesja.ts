import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * Sesja logowania. Supabase trzyma ją w przeglądarce, więc raz zalogowany
 * domownik nie musi podawać hasła przy każdym wejściu.
 */
export function useSesja() {
  const [sesja, setSesja] = useState<Session | null>(null)
  // Dopóki nie sprawdzimy zapisanej sesji, nie wiemy, czy pokazać logowanie.
  const [sprawdzone, setSprawdzone] = useState(false)

  useEffect(() => {
    let aktualne = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!aktualne) return
      setSesja(data.session)
      setSprawdzone(true)
    })

    // Reaguje też na wylogowanie w innej karcie i na wygaśnięcie tokenu.
    const { data } = supabase.auth.onAuthStateChange((_zdarzenie, nowa) => {
      setSesja(nowa)
    })

    return () => {
      aktualne = false
      data.subscription.unsubscribe()
    }
  }, [])

  return { sesja, sprawdzone }
}

/** Logowanie adresem i hasłem. Zwraca komunikat błędu albo null. */
export async function zaloguj(email: string, haslo: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: haslo,
  })

  if (!error) return null

  // Supabase odpowiada po angielsku - tłumaczymy dwa najczęstsze przypadki.
  if (error.message.includes('Invalid login credentials')) {
    return 'Nieprawidłowy adres e-mail lub hasło.'
  }
  if (error.message.includes('Email not confirmed')) {
    return 'Konto nie zostało potwierdzone. Wyłącz "Confirm email" w panelu Supabase.'
  }
  return `Nie udało się zalogować: ${error.message}`
}

export async function wyloguj() {
  await supabase.auth.signOut()
}
