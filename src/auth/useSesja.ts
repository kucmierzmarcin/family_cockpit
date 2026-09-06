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

/**
 * Zakłada konto. Przy wyłączonym "Confirm email" Supabase od razu zwraca sesję,
 * więc rejestracja od razu wpuszcza do aplikacji.
 */
export async function zarejestruj(email: string, haslo: string): Promise<string | null> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: haslo,
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return 'Konto z tym adresem już istnieje. Zaloguj się.'
    }
    if (error.message.includes('Signups not allowed')) {
      return 'Zakładanie kont jest wyłączone. Włącz "Allow new users to sign up" w panelu Supabase.'
    }
    if (error.message.toLowerCase().includes('password')) {
      return 'Hasło jest za krótkie - potrzeba co najmniej 6 znaków.'
    }
    return `Nie udało się założyć konta: ${error.message}`
  }

  // Konto powstało, ale bez sesji - to znaczy, że Supabase czeka na potwierdzenie
  // adresu mailem. Poczty nie mamy, więc trzeba wyłączyć tę opcję w panelu.
  if (!data.session) {
    return 'Konto założone, ale wymaga potwierdzenia mailem. Wyłącz "Confirm email" w panelu Supabase.'
  }

  return null
}

export async function wyloguj() {
  await supabase.auth.signOut()
}
