import type { DomownikDb } from './lib/supabase'
import { kolor } from './kolory'
import { czyPilna, type Paczka } from './paczki'
import { dlugaDataZDniem } from './dates'
import { Wczytywanie } from './uklad/Wczytywanie'

type Props = {
  paczki: Paczka[]
  ladowanie: boolean
  osobaPoId: Map<string, DomownikDb>
  onOdswiez: () => void
}

/** Ekran „Paczki": co czeka w paczkomacie i do kiedy. */
export function Paczki({ paczki, ladowanie, osobaPoId, onOdswiez }: Props) {
  const teraz = new Date()

  if (ladowanie) return <Wczytywanie wierszy={3} />

  return (
    <div className="paczki">
      <button type="button" className="drobny" onClick={onOdswiez}>
        Odśwież teraz
      </button>

      {paczki.length === 0 ? (
        <p className="pusto">Nic nie czeka na odbiór.</p>
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
