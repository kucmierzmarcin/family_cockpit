import { useCallback, useEffect, useState } from 'react'
import { supabase, type DomownikDb, type Rola } from './lib/supabase'
import { useNaZywo } from './useNaZywo'
import { wolnyKolor } from './kolory'

/** Dane nowej osoby. Dom ustawia baza (domyślna wartość household_id). */
export type NowyDomownik = {
  name: string
  color: string
  role: Rola
  email: string | null
}

/** Co wolno zmienić istniejącej osobie. */
export type ZmianaDomownika = Partial<Pick<DomownikDb, 'name' | 'color' | 'role' | 'email'>>

/**
 * Lista domowników i operacje na niej. Trzymana osobno od kalendarza,
 * bo to niezależny byt - ekrany dostają gotowe dane i cztery funkcje.
 */
export function useDomownicy(onBlad: (tekst: string) => void) {
  const [domownicy, setDomownicy] = useState<DomownikDb[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  useEffect(() => {
    let aktualne = true

    void (async () => {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('created_at')

      if (!aktualne) return

      if (error) onBlad(`Nie udało się wczytać domowników: ${error.message}`)
      else setDomownicy(data ?? [])
      setLadowanie(false)
    })()

    return () => {
      aktualne = false
    }
    // `onBlad` musi być stabilne (w App.tsx to `setBlad` z useState).
  }, [onBlad])

  const odswiez = useCallback(async () => {
    const { data, error } = await supabase.from('members').select('*').order('created_at')
    if (error) onBlad(`Nie udało się wczytać domowników: ${error.message}`)
    else setDomownicy(data ?? [])
  }, [onBlad])

  // Zmiany w składzie domu widać u wszystkich bez odświeżania.
  useNaZywo('domownicy-na-zywo', ['members'], () => void odswiez())

  /** Propozycja koloru dla kolejnej osoby - pierwszy jeszcze niezajęty. */
  const proponowanyKolor = useCallback(
    () => wolnyKolor(domownicy.map((d) => d.color)),
    [domownicy],
  )

  const dodaj = useCallback(
    async (nowy: NowyDomownik): Promise<boolean> => {
      const { data, error } = await supabase
        .from('members')
        .insert({ ...nowy, email: nowy.email || null })
        .select()
        .single()

      if (error || !data) {
        onBlad(`Nie udało się dodać domownika: ${error?.message ?? 'brak odpowiedzi'}`)
        return false
      }

      setDomownicy((starzy) => [...starzy, data])
      return true
    },
    [onBlad],
  )

  const zmien = useCallback(
    async (id: string, zmiany: ZmianaDomownika): Promise<boolean> => {
      const { data, error } = await supabase
        .from('members')
        .update({ ...zmiany, email: zmiany.email || null })
        .eq('id', id)
        .select()
        .single()

      if (error || !data) {
        onBlad(`Nie udało się zapisać zmiany: ${error?.message ?? 'brak odpowiedzi'}`)
        return false
      }

      setDomownicy((starzy) => starzy.map((d) => (d.id === id ? data : d)))
      return true
    },
    [onBlad],
  )

  const usun = useCallback(
    async (id: string) => {
      const kopia = domownicy
      setDomownicy((starzy) => starzy.filter((d) => d.id !== id)) // od razu znika z ekranu

      const { error } = await supabase.from('members').delete().eq('id', id)
      if (error) {
        setDomownicy(kopia) // nie wyszło - przywracamy
        onBlad(`Nie udało się usunąć domownika: ${error.message}`)
      }
    },
    [domownicy, onBlad],
  )

  return { domownicy, ladowanie, dodaj, zmien, usun, proponowanyKolor }
}
