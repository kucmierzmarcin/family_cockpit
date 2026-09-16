import { useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'

/**
 * Nazwy kanałów otwartych w tej chwili - wyłącznie po to, żeby złamanie zasady
 * "unikalna nazwa kanału" (ta sama nazwa na dwóch ekranach naraz) dało czytelny
 * komunikat w konsoli zamiast wyjątku z głębi supabase-js, który wywraca całe
 * drzewo renderowania.
 */
const aktywneKanaly = new Set<string>()

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
    if (aktywneKanaly.has(nazwa)) {
      console.error(
        `useNaZywo: kanał "${nazwa}" jest już używany przez inny ekran - podaj unikalną nazwę.`,
      )
    }
    aktywneKanaly.add(nazwa)

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
      aktywneKanaly.delete(nazwa)
      void supabase.removeChannel(kanal)
    }
  }, [nazwa, klucz])
}
