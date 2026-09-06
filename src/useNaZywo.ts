import { useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'

/**
 * Nasłuchuje zmian we wskazanych tabelach i woła `onZmiana`, gdy któraś się
 * zmieni. Dzięki temu domownik widzi cudze wpisy bez odświeżania strony.
 *
 * `onZmiana` trzymamy w ref, a kanał otwieramy raz: gdyby był w zależnościach
 * efektu, każda zmiana danych zrywałaby i odtwarzała połączenie.
 *
 * Realtime respektuje reguły RLS, więc kanał nie przyniesie danych z cudzego
 * domu - subskrypcja nie jest obejściem uprawnień.
 *
 * @param nazwa  unikalna nazwa kanału; dwa ekrany nie mogą używać tej samej
 * @param tabele tabele w schemacie `public` do obserwowania
 */
export function useNaZywo(nazwa: string, tabele: string[], onZmiana: () => void) {
  const onZmianaRef = useRef(onZmiana)
  useEffect(() => {
    onZmianaRef.current = onZmiana
  }, [onZmiana])

  // Tablica w zależnościach efektu zmieniałaby referencję przy każdym renderze,
  // więc porównujemy jej zawartość jako tekst.
  const klucz = tabele.join(',')

  useEffect(() => {
    let kanal = supabase.channel(nazwa)

    for (const tabela of klucz.split(',')) {
      kanal = kanal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabela },
        () => onZmianaRef.current(),
      )
    }

    kanal.subscribe()

    return () => {
      void supabase.removeChannel(kanal)
    }
  }, [nazwa, klucz])
}
