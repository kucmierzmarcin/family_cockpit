import { useMemo, useState } from 'react'
import type { DomownikDb } from './lib/supabase'
import {
  pogrupujLekcjePoDniu,
  posortujWiadomosci,
  posortujWpisy,
  type Lekcja,
  type StatusPolaczenia,
  type Wiadomosc,
  type Wpis,
} from './vulcan'
import { dlugaData } from './dates'

type Props = {
  domownicy: DomownikDb[]
  status: StatusPolaczenia | null
  lekcje: Lekcja[]
  wpisy: Wpis[]
  wiadomosci: Wiadomosc[]
  ladowanie: boolean
}

type PodZakladka = 'plan' | 'wpisy' | 'wiadomosci'

const OPISY_TYPU: Record<Wpis['typ'], string> = {
  sprawdzian: 'Sprawdzian',
  zadanie_domowe: 'Zadanie domowe',
}

/** Ekran „Szkoła": plan lekcji, sprawdziany/zadania domowe i wiadomości z Vulcan. */
export function Szkola({ domownicy, status, lekcje, wpisy, wiadomosci, ladowanie }: Props) {
  const [podZakladka, setPodZakladka] = useState<PodZakladka>('plan')
  const [wybranyUczen, setWybranyUczen] = useState<string | null>(null)
  const [rozwinieta, setRozwinieta] = useState<string | null>(null)

  const uczniowie = status?.uczniowie.filter((u) => u.memberId !== null) ?? []
  const nazwaDomownika = new Map(domownicy.map((d) => [d.id, d.name]))

  const filtrUczniaId = uczniowie.length > 1 ? wybranyUczen : (uczniowie[0]?.id ?? null)

  const lekcjeWidoczne = useMemo(
    () => (filtrUczniaId ? lekcje.filter((l) => l.uczenId === filtrUczniaId) : lekcje),
    [lekcje, filtrUczniaId],
  )
  const wpisyWidoczne = useMemo(
    () => posortujWpisy(filtrUczniaId ? wpisy.filter((w) => w.uczenId === filtrUczniaId) : wpisy),
    [wpisy, filtrUczniaId],
  )
  const wiadomosciWidoczne = useMemo(
    () => posortujWiadomosci(filtrUczniaId ? wiadomosci.filter((w) => w.uczenId === filtrUczniaId) : wiadomosci),
    [wiadomosci, filtrUczniaId],
  )
  const dniPlanu = useMemo(() => pogrupujLekcjePoDniu(lekcjeWidoczne), [lekcjeWidoczne])

  function nazwaUcznia(uczenId: string): string {
    const u = uczniowie.find((x) => x.id === uczenId)
    return u ? (nazwaDomownika.get(u.memberId ?? '') ?? `${u.imie} ${u.nazwisko}`) : ''
  }

  if (ladowanie) return <p className="pusto">Wczytuję…</p>

  if (!status?.istnieje || uczniowie.length === 0) {
    return (
      <div className="szkola">
        <p className="pusto">
          Brak połączenia z Vulcan
          {uczniowie.length === 0 && status?.istnieje ? ' — żaden uczeń nie jest jeszcze przypisany.' : '.'}
          {' '}Skonfiguruj je w zakładce „Mój dom".
        </p>
      </div>
    )
  }

  return (
    <div className="szkola">
      {uczniowie.length > 1 && (
        <div className="filtry" role="group" aria-label="Pokaż dane ucznia">
          <button
            type="button"
            className={`filtr${wybranyUczen === null ? ' wlaczony' : ''}`}
            aria-pressed={wybranyUczen === null}
            onClick={() => setWybranyUczen(null)}
          >
            Wszyscy
          </button>
          {uczniowie.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`filtr${wybranyUczen === u.id ? ' wlaczony' : ''}`}
              aria-pressed={wybranyUczen === u.id}
              onClick={() => setWybranyUczen(u.id)}
            >
              {nazwaDomownika.get(u.memberId ?? '') ?? u.imie}
            </button>
          ))}
        </div>
      )}

      <div className="listy-pasek" role="tablist" aria-label="Widok szkoły">
        <button
          type="button"
          role="tab"
          aria-selected={podZakladka === 'plan'}
          className={`zakladka${podZakladka === 'plan' ? ' aktywna' : ''}`}
          onClick={() => setPodZakladka('plan')}
        >
          Plan lekcji
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={podZakladka === 'wpisy'}
          className={`zakladka${podZakladka === 'wpisy' ? ' aktywna' : ''}`}
          onClick={() => setPodZakladka('wpisy')}
        >
          Sprawdziany i zadania
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={podZakladka === 'wiadomosci'}
          className={`zakladka${podZakladka === 'wiadomosci' ? ' aktywna' : ''}`}
          onClick={() => setPodZakladka('wiadomosci')}
        >
          Wiadomości
        </button>
      </div>

      {podZakladka === 'plan' &&
        (dniPlanu.size === 0 ? (
          <p className="pusto">Brak lekcji w tym tygodniu.</p>
        ) : (
          <div className="plan-lekcji">
            {[...dniPlanu.entries()].map(([dzien, lekcjeDnia]) => (
              <section key={dzien} className="dzien-planu">
                <h3 className="dzien-planu-naglowek">{dlugaData(new Date(`${dzien}T12:00:00`))}</h3>
                <ul className="lista-lekcji">
                  {lekcjeDnia.map((l) => (
                    <li key={l.id} className={`lekcja${l.zmieniona ? ' lekcja-zmieniona' : ''}`}>
                      <span className="lekcja-godziny">
                        {l.od}–{l.do}
                      </span>
                      <span className="lekcja-przedmiot">
                        {l.przedmiot}
                        {uczniowie.length > 1 && !filtrUczniaId && (
                          <span className="meta"> · {nazwaUcznia(l.uczenId)}</span>
                        )}
                      </span>
                      {(l.nauczyciel || l.sala) && (
                        <span className="lekcja-detale">
                          {[l.nauczyciel, l.sala].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {l.zmieniona && <span className="lekcja-zmiana-etykieta">{l.opisZmiany ?? 'Zmiana'}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}

      {podZakladka === 'wpisy' &&
        (wpisyWidoczne.length === 0 ? (
          <p className="pusto">Brak sprawdzianów i zadań domowych.</p>
        ) : (
          <div className="tabela-terminow-kontener">
            <table className="tabela-terminow">
              <thead>
                <tr>
                  <th>Data</th>
                  {!filtrUczniaId && uczniowie.length > 1 && <th>Uczeń</th>}
                  <th>Przedmiot</th>
                  <th>Typ</th>
                  <th>Opis</th>
                </tr>
              </thead>
              <tbody>
                {wpisyWidoczne.map((w) => (
                  <tr key={w.id}>
                    <td>{dlugaData(new Date(`${w.data}T12:00:00`))}</td>
                    {!filtrUczniaId && uczniowie.length > 1 && <td>{nazwaUcznia(w.uczenId)}</td>}
                    <td className="tytul-terminu">{w.przedmiot}</td>
                    <td>
                      <span className={`status-terminu ${w.typ === 'sprawdzian' ? 'status-przeterminowany' : 'status-aktywny'}`}>
                        {OPISY_TYPU[w.typ]}
                      </span>
                    </td>
                    <td className="opis-terminu">{w.opis ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {podZakladka === 'wiadomosci' &&
        (wiadomosciWidoczne.length === 0 ? (
          <p className="pusto">Brak wiadomości.</p>
        ) : (
          <ul className="lista-wiadomosci-vulcan">
            {wiadomosciWidoczne.map((w) => (
              <li key={w.id} className="wiadomosc-vulcan">
                <button
                  type="button"
                  className="wiadomosc-vulcan-naglowek"
                  aria-expanded={rozwinieta === w.id}
                  onClick={() => setRozwinieta(rozwinieta === w.id ? null : w.id)}
                >
                  <span className="wiadomosc-vulcan-nadawca">{w.nadawca}</span>
                  <span className="wiadomosc-vulcan-temat">{w.temat}</span>
                  <span className="meta">
                    {dlugaData(new Date(w.data))},{' '}
                    {new Date(w.data).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
                {rozwinieta === w.id && <p className="wiadomosc-vulcan-tresc">{w.tresc}</p>}
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
