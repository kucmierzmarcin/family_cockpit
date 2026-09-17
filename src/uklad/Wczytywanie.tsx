type Props = {
  /** Ile pasków udaje wiersze treści. Dobierz do tego, co się wczyta. */
  wierszy?: number
}

/**
 * Stan „dane jeszcze lecą".
 *
 * Do tej pory każdy ekran pokazywał w tym miejscu `<p className="pusto">`, czyli
 * dokładnie to samo pudełko z przerywaną ramką, co komunikat „nic tu nie ma".
 * Ładowanie było więc nie do odróżnienia od pustki - a to dwie różne wiadomości
 * i prowadzą do dwóch różnych reakcji (poczekaj / dodaj pierwszą rzecz).
 *
 * Paski mają różne szerokości, bo równiutki rządek wygląda jak element
 * interfejsu, a nie jak zapowiedź tekstu.
 *
 * `role="status"` z `aria-busy` mówi czytnikowi ekranu, co się dzieje; same
 * paski są ozdobą i nie mają nic do powiedzenia.
 */
export function Wczytywanie({ wierszy = 3 }: Props) {
  const szerokosci = ['92%', '74%', '83%', '61%', '88%']

  return (
    <div className="wczytywanie" role="status" aria-busy="true" aria-label="Wczytuję">
      {Array.from({ length: wierszy }, (_, i) => (
        <span
          key={i}
          className="szkielet wczytywanie-pasek"
          style={{ width: szerokosci[i % szerokosci.length] }}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
