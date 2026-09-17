import { useEffect, useRef } from 'react'

const ID_SKRYPTU = 'weatherwidget-io-js'

const KOTWICA_HTML =
  '<a class="weatherwidget-io" href="https://forecast7.com/pl/52d1220d67/milanowek/" ' +
  'data-label_1="MILANÓWEK" data-font="Roboto" data-icons="Climacons Animated" ' +
  'data-days="3" data-theme="pure">MILANÓWEK</a>'

/**
 * Osadza widget pogodowy weatherwidget.io (dane forecast7.com) dla Milanówka.
 *
 * React NIE zarządza wnętrzem tego diva - biblioteka widgetu sama podmienia
 * kotwicę `<a>` na iframe poza kontrolą Reacta. Zwykły JSX zderzyłby się z tą
 * podmianą przy odmontowaniu (błąd "removeChild"), więc treść ustawiamy raz,
 * imperatywnie, przez `ref`.
 *
 * Skrypt widgetu skanuje stronę TYLKO RAZ, w momencie wykonania - a Dashboard
 * odmontowuje się przy każdej zmianie zakładki (ekran === 'dashboard' w
 * App.tsx). Powrót na "Dziś" renderuje świeżą kotwicę, której już wykonany
 * wcześniej skrypt by nie zauważył. Dlatego przy każdym zamontowaniu usuwamy
 * poprzedni `<script>` i dodajemy go od nowa, żeby wymusić ponowne skanowanie.
 */
export function PogodaWidget() {
  const kontenerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const kontener = kontenerRef.current
    if (!kontener) return
    kontener.innerHTML = KOTWICA_HTML

    document.getElementById(ID_SKRYPTU)?.remove()
    const skrypt = document.createElement('script')
    skrypt.id = ID_SKRYPTU
    skrypt.src = 'https://weatherwidget.io/js/widget.min.js'
    document.body.appendChild(skrypt)

    return () => {
      document.getElementById(ID_SKRYPTU)?.remove()
    }
  }, [])

  // Klasa niesie zarezerwowaną wysokość: dopóki skrypt nie podmieni kotwicy na
  // iframe, ten div ma zero pikseli i wszystko pod nim skacze w dół, gdy widget
  // wreszcie doleci (na telefonie karty stoją jedna pod drugą, więc skok widać
  // wprost).
  return <div className="pogoda-miejsce" ref={kontenerRef} />
}
