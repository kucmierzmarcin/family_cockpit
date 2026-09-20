import { useEffect } from 'react'
import { SLUGI } from './nawigacja'

/** Co ile godzin przeładować stronę - patrz `useAutoOdswiezanie`. */
export const GODZINY_MIEDZY_ODSWIEZENIEM = 3

/**
 * Tablet powieszony na ścianie stoi otwarty tygodniami - bez tego jedyny
 * sposób na "zamula" (wyciek pamięci, martwe połączenie Realtime) to ktoś
 * fizycznie odblokowujący ekran i odświeżający ręcznie. Pełny reload karty
 * zamiast np. ponownego łączenia Supabase - najprostszy sposób na czysty
 * stan, którego nie trzeba pilnować osobno dla każdego źródła danych.
 *
 * Zawsze wraca na "Dziś" - tablet ma tam stać, nie tam, gdzie akurat ktoś
 * ostatnio kliknął przed przeładowaniem.
 */
export function useAutoOdswiezanie(godziny: number = GODZINY_MIEDZY_ODSWIEZENIEM): void {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.hash = `#/${SLUGI.dashboard}`
      window.location.reload()
    }, godziny * 60 * 60 * 1000)
    return () => clearTimeout(timer)
  }, [godziny])
}
