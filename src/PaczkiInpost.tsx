import type { DomownikDb } from './lib/supabase'
import { kolor } from './kolory'
import { czyPilna, type Paczka } from './paczki'
import { dlugaDataZDniem } from './dates'
import { Wczytywanie } from './uklad/Wczytywanie'
import type { StatusInpost } from './uklad/ParowanieInpost'

type Props = {
  paczki: Paczka[]
  polaczenia: StatusInpost[]
  ladowanie: boolean
  osobaPoId: Map<string, DomownikDb>
  onOdswiez: () => void
  onPrzejdzDoDomu: () => void
}

/**
 * Pusta lista znaczy trzy rozne rzeczy i tylko jedna z nich to "wszystko gra".
 *
 * Wczesniej kazda z nich dostawala to samo zdanie "Nic nie czeka na odbiór." -
 * wiec domownik, ktory nigdy nie podpial numeru, dostawal komunikat sugerujacy,
 * ze integracja dziala i po prostu nie ma paczek. Nie mial jak sie dowiedziec,
 * ze czegos brakuje, ani gdzie tego szukac.
 */
function PustaLista({
  polaczenia,
  onPrzejdzDoDomu,
}: {
  polaczenia: StatusInpost[]
  onPrzejdzDoDomu: () => void
}) {
  if (polaczenia.length === 0) {
    return (
      <div className="paczki-pusto">
        <p className="pusto-tytul">Nikt jeszcze nie podpiął numeru InPostu.</p>
        <p>Paczki pojawią się tutaj, gdy domownik połączy swój numer telefonu na ekranie „Mój dom".</p>
        <button type="button" className="drobny" onClick={onPrzejdzDoDomu}>
          Przejdź do „Mój dom"
        </button>
      </div>
    )
  }

  const wygasle = polaczenia.filter((p) => p.status === 'wymaga_ponownego_logowania')
  if (wygasle.length === polaczenia.length) {
    return (
      <div className="paczki-pusto">
        <p className="pusto-tytul">Sesja InPostu wygasła.</p>
        <p>
          Dopóki nie połączysz numeru ponownie, lista zostaje pusta - także wtedy, gdy coś czeka w
          paczkomacie. Dotyczy: {wygasle.map((p) => p.imie).join(', ')}.
        </p>
        <button type="button" className="drobny" onClick={onPrzejdzDoDomu}>
          Połącz ponownie w „Mój dom"
        </button>
      </div>
    )
  }

  return <p className="pusto">Nic nie czeka na odbiór.</p>
}

/** Ekran „Paczki": co czeka w paczkomacie i do kiedy. */
export function Paczki({
  paczki,
  polaczenia,
  ladowanie,
  osobaPoId,
  onOdswiez,
  onPrzejdzDoDomu,
}: Props) {
  const teraz = new Date()

  if (ladowanie) return <Wczytywanie wierszy={3} />

  return (
    <div className="paczki">
      <button type="button" className="drobny" onClick={onOdswiez}>
        Odśwież teraz
      </button>

      {paczki.length === 0 ? (
        <PustaLista polaczenia={polaczenia} onPrzejdzDoDomu={onPrzejdzDoDomu} />
      ) : (
        <ul className="lista-paczek">
          {paczki.map((p) => {
            const osoba = osobaPoId.get(p.memberId)
            const pilna = czyPilna(p.odbierzDo, teraz)
            return (
              <li key={p.id} className={`karta karta-paczki${pilna ? ' pilna' : ''}`}>
                <p className="paczka-nadawca">{p.nadawca ?? 'Nieznany nadawca'}</p>
                <p className="paczka-punkt">
                  {p.punkt ?? '—'}
                  {p.adres && <span className="meta">{p.adres}</span>}
                </p>
                <div className="paczka-stopka">
                  <span className="autor">
                    {osoba && (
                      <span
                        className="kropka"
                        style={{ background: kolor(osoba.color).kropka }}
                        aria-hidden="true"
                      />
                    )}
                    {osoba?.name ?? 'ktoś z domu'}
                  </span>
                  {p.odbierzDo && (
                    <span className={`paczka-termin${pilna ? ' pilny' : ''}`}>
                      odbierz do {dlugaDataZDniem(p.odbierzDo)}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
