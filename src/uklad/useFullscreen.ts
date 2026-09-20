import { useCallback, useSyncExternalStore } from 'react'

function subskrybuj(zmiana: () => void): () => void {
  document.addEventListener('fullscreenchange', zmiana)
  return () => document.removeEventListener('fullscreenchange', zmiana)
}

function czyAktywny(): boolean {
  return document.fullscreenElement !== null
}

/**
 * Pełny ekran całej strony (nie tylko jednego elementu) - do tabletu
 * powieszonego na ścianie: zakładka "Dziś" ma wtedy zniknąć, co ją otacza
 * (pasek adresu, belka systemowa), i mieścić się w jednym kawałku.
 *
 * `document.fullscreenElement` zamiast osobnego stanu w komponencie - Esc czy
 * gest systemowy telefonu wychodzi z pełnego ekranu BEZ wywołania naszego
 * `wylacz()`, więc stan trzeba czytać ze źródła prawdy przeglądarki, nie
 * zgadywać go po tym, co sami kliknęliśmy.
 */
export function useFullscreen(): { aktywny: boolean; przelacz: () => void } {
  const aktywny = useSyncExternalStore(subskrybuj, czyAktywny)

  const przelacz = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void document.documentElement.requestFullscreen()
    }
  }, [])

  return { aktywny, przelacz }
}
