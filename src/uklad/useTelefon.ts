import { useEffect, useState } from 'react'

/**
 * Poniżej tego progu wchodzi układ telefonu. 768, a nie dzisiejsze 900:
 * tablet w pionie ma miejsce na układ biurkowy, a dolny pasek na dziesięciu
 * calach wygląda jak pomyłka.
 */
export const PROG_TELEFONU = 768

const ZAPYTANIE = `(max-width: ${PROG_TELEFONU - 1}px)`

export function useTelefon(): boolean {
  const [telefon, setTelefon] = useState(() => window.matchMedia(ZAPYTANIE).matches)

  useEffect(() => {
    const zapytanie = window.matchMedia(ZAPYTANIE)
    const reaguj = (e: MediaQueryListEvent) => setTelefon(e.matches)

    zapytanie.addEventListener('change', reaguj)
    // Szerokość mogła się zmienić między pierwszym renderem a podpięciem
    // nasłuchu - np. przy obrocie telefonu w trakcie ładowania.
    setTelefon(zapytanie.matches)

    return () => zapytanie.removeEventListener('change', reaguj)
  }, [])

  return telefon
}
