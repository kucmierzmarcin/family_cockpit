import { useEffect, useRef } from 'react'

/**
 * Systemowy „Wstecz" zamyka otwarty arkusz zamiast opuszczać ekran.
 *
 * Na Androidzie gest cofania to podstawowy sposób wycofania się z czegokolwiek.
 * Bez tego otwarty arkusz zostawał na wierzchu, a aplikacja przeskakiwała
 * ekran wstecz pod nim - albo wychodziła całkiem.
 *
 * Działa przez sztuczny wpis w historii: otwarcie arkusza dokłada wpis pod tym
 * samym adresem, a `popstate` znaczy wtedy „ktoś cofnął". Adres się nie zmienia,
 * więc `useTrasa` (nasłuchujące `hashchange`) w ogóle tego nie widzi - i dobrze,
 * bo arkusz nie jest osobnym miejscem w aplikacji, tylko warstwą nad nim.
 */
export function useZamykanieWstecz(otwarte: boolean, onZamknij: () => void): void {
  // Wywołanie zamykające trzymamy w ref, nie w zależnościach: inaczej każda
  // zmiana identyczności `onZamknij` (a rodzice tworzą je zwykle inline)
  // zrywałaby efekt i dokładała kolejny wpis do historii.
  const zamknij = useRef(onZamknij)
  useEffect(() => {
    zamknij.current = onZamknij
  }, [onZamknij])

  useEffect(() => {
    if (!otwarte) return

    const adresPrzyOtwarciu = window.location.href
    let naszWpisStoiNaWierzchu = true

    window.history.pushState({ arkuszOtwarty: true }, '')

    function naWstecz() {
      // Przeglądarka zdjęła nasz wpis, więc nie mamy już czego sprzątać.
      naszWpisStoiNaWierzchu = false
      zamknij.current()
    }

    window.addEventListener('popstate', naWstecz)

    return () => {
      window.removeEventListener('popstate', naWstecz)

      // Arkusz zamknięto inaczej niż cofnięciem (krzyżyk, Escape, tło, zapis):
      // sztuczny wpis trzeba zdjąć samemu, inaczej pierwsze „Wstecz" po
      // zamknięciu nie zrobiłoby nic widocznego.
      //
      // Ale tylko wtedy, gdy adres się nie zmienił. Jeśli w międzyczasie ktoś
      // przeszedł na inną zakładkę, `history.back()` cofnąłby tę nawigację -
      // czyli zabrałby użytkownika z ekranu, na który właśnie wszedł.
      if (naszWpisStoiNaWierzchu && window.location.href === adresPrzyOtwarciu) {
        window.history.back()
      }
    }
  }, [otwarte])
}
