import { useMemo, useState } from 'react'
import type { DomownikDb } from './lib/supabase'
import {
  czyNieusprawiedliwiona,
  oczyscTrescWiadomosci,
  pogrupujLekcjePoDniu,
  posortujObecnosci,
  posortujWiadomosci,
  posortujWpisy,
  type Lekcja,
  type Obecnosc,
  type StatusPolaczenia,
  type Wiadomosc,
  type Wpis,
} from './vulcan'
import { dlugaData, dlugaDataZDniem, klucz } from './dates'
import { kolor } from './kolory'

type Props = {
  domownicy: DomownikDb[]
  status: StatusPolaczenia | null
  lekcje: Lekcja[]
  wpisy: Wpis[]
  wiadomosci: Wiadomosc[]
  obecnosci: Obecnosc[]
  ladowanie: boolean
}

type PodZakladka = 'plan' | 'wpisy' | 'wiadomosci' | 'frekwencja'

const OPISY_TYPU: Record<Wpis['typ'], string> = {
  sprawdzian: 'Sprawdzian',
  zadanie_domowe: 'Zadanie domowe',
}

/** Ekran „Szkoła": plan lekcji, sprawdziany/zadania domowe i wiadomości z Vulcan. */
export function Szkola({ domownicy, status, lekcje, wpisy, wiadomosci, obecnosci, ladowanie }: Props) {
  const [podZakladka, setPodZakladka] = useState<PodZakladka>('plan')
  const [wybranyUczen, setWybranyUczen] = useState<string | null>(null)
  const [rozwinieta, setRozwinieta] = useState<string | null>(null)
  const [pokazMinione, setPokazMinione] = useState(false)

  const uczniowie = status?.uczniowie.filter((u) => u.memberId !== null) ?? []
  const domownikPoId = new Map(domownicy.map((d) => [d.id, d]))
  const nazwaDomownika = new Map(domownicy.map((d) => [d.id, d.name]))

  // Dane zawsze pokazujemy dla JEDNEGO wybranego ucznia - łączony widok
  // "Wszyscy" nie miał sensu (przedmioty/plany są per dziecko). Jeśli
  // zapamiętany wybór wskazuje na ucznia, którego już nie ma na liście
  // (np. odpięty od domownika), samoleczy się na pierwszego dostępnego.
  const filtrUczniaId =
    wybranyUczen && uczniowie.some((u) => u.id === wybranyUczen) ? wybranyUczen : (uczniowie[0]?.id ?? null)

  // Domyślnie tylko dziś i kolejne dni, maks. 2 tygodnie naprzód - minione
  // dni planu nie są tu potrzebne, a bez górnej granicy widok mógłby się
  // rozciągnąć w nieskończoność, gdyby backend zaczął synchronizować dalej
  // niż bieżący tydzień.
  const dzisiaj = klucz(new Date())
  const zaDwaTygodnie = useMemo(() => {
    const data = new Date()
    data.setDate(data.getDate() + 13)
    return klucz(data)
  }, [])

  const lekcjeWidoczne = useMemo(
    () => lekcje.filter((l) => l.uczenId === filtrUczniaId && l.data >= dzisiaj && l.data <= zaDwaTygodnie),
    [lekcje, filtrUczniaId, dzisiaj, zaDwaTygodnie],
  )
  const wpisyUcznia = useMemo(
    () => posortujWpisy(wpisy.filter((w) => w.uczenId === filtrUczniaId)),
    [wpisy, filtrUczniaId],
  )
  // Domyślnie tylko nadchodzące - historia sprawdzianów i zadań rośnie w
  // nieskończoność i spychała najbliższe terminy poza widok. Minione wciąż
  // można pokazać przełącznikiem.
  const wpisyMinione = useMemo(() => wpisyUcznia.filter((w) => w.data < dzisiaj), [wpisyUcznia, dzisiaj])
  const wpisyWidoczne = useMemo(
    () => (pokazMinione ? wpisyUcznia : wpisyUcznia.filter((w) => w.data >= dzisiaj)),
    [wpisyUcznia, pokazMinione, dzisiaj],
  )
  // Każdy uczeń ma WŁASNĄ skrzynkę wiadomości w eduVULCAN (potwierdzone żywym
  // testem 2026-09-14 - wcześniejsze założenie "skrzynka rodzica, wspólna dla
  // domu" było prawdziwe tylko dla starego Vulcan), więc filtrujemy tak samo
  // jak plan lekcji i wpisy - po wybranym uczniu. Tylko ostatnie 14 dni -
  // starsze wciąż są zsynchronizowane w bazie, ale historia wiadomości rośnie
  // w nieskończoność i bez granicy zasypywałaby najnowsze (ten sam wzorzec co
  // "dziś + 2 tygodnie" w planie lekcji wyżej).
  const czternascieDniTemu = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 13)
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const wiadomosciWidoczne = useMemo(
    () =>
      posortujWiadomosci(wiadomosci).filter(
        (w) => w.uczenId === filtrUczniaId && new Date(w.data) >= czternascieDniTemu,
      ),
    [wiadomosci, filtrUczniaId, czternascieDniTemu],
  )
  const dniPlanu = useMemo(() => pogrupujLekcjePoDniu(lekcjeWidoczne), [lekcjeWidoczne])
  const obecnosciUcznia = useMemo(
    () => posortujObecnosci(obecnosci.filter((o) => o.uczenId === filtrUczniaId)),
    [obecnosci, filtrUczniaId],
  )
  const liczbaNieusprawiedliwionych = useMemo(
    () => obecnosciUcznia.filter(czyNieusprawiedliwiona).length,
    [obecnosciUcznia],
  )

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
          {uczniowie.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`filtr${filtrUczniaId === u.id ? ' wlaczony' : ''}`}
              aria-pressed={filtrUczniaId === u.id}
              onClick={() => setWybranyUczen(u.id)}
            >
              <span
                className="kropka"
                style={{ background: kolor(domownikPoId.get(u.memberId ?? '')?.color).kropka }}
                aria-hidden="true"
              />
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
        <button
          type="button"
          role="tab"
          aria-selected={podZakladka === 'frekwencja'}
          className={`zakladka${podZakladka === 'frekwencja' ? ' aktywna' : ''}`}
          onClick={() => setPodZakladka('frekwencja')}
        >
          Frekwencja
        </button>
      </div>

      {podZakladka === 'plan' &&
        (dniPlanu.size === 0 ? (
          <p className="pusto">Brak zaplanowanych lekcji w najbliższych dniach.</p>
        ) : (
          <div className="plan-lekcji">
            {[...dniPlanu.entries()].map(([dzien, lekcjeDnia]) => (
              <section key={dzien} className="dzien-planu">
                <h2 className="dzien-planu-naglowek">{dlugaDataZDniem(new Date(`${dzien}T12:00:00`))}</h2>
                <ul className="lista-lekcji">
                  {lekcjeDnia.map((l) => (
                    <li key={l.id} className={`lekcja${l.zmieniona ? ' lekcja-zmieniona' : ''}`}>
                      <span className="lekcja-godziny">
                        {l.od}–{l.do}
                      </span>
                      <span className="lekcja-przedmiot">{l.przedmiot}</span>
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

      {podZakladka === 'wpisy' && wpisyMinione.length > 0 && (
        <div className="akcje-wpisow">
          <button type="button" className="drobny" onClick={() => setPokazMinione(!pokazMinione)}>
            {pokazMinione ? 'Ukryj minione' : `Pokaż też minione (${wpisyMinione.length})`}
          </button>
        </div>
      )}

      {podZakladka === 'wpisy' &&
        (wpisyWidoczne.length === 0 ? (
          <p className="pusto">
            {pokazMinione || wpisyMinione.length === 0
              ? 'Brak sprawdzianów i zadań domowych.'
              : 'Brak nadchodzących sprawdzianów i zadań domowych.'}
          </p>
        ) : (
          <div className="tabela-terminow-kontener">
            <table className="tabela-terminow">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Przedmiot</th>
                  <th>Typ</th>
                  <th>Opis</th>
                </tr>
              </thead>
              <tbody>
                {wpisyWidoczne.map((w) => (
                  <tr key={w.id}>
                    <td>{dlugaData(new Date(`${w.data}T12:00:00`))}</td>
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
              <li
                key={w.id}
                className={`wiadomosc-vulcan${klucz(new Date(w.data)) === dzisiaj ? ' wiadomosc-vulcan-dzis' : ''}`}
              >
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
                {rozwinieta === w.id && (
                  <p className="wiadomosc-vulcan-tresc">{oczyscTrescWiadomosci(w.tresc)}</p>
                )}
              </li>
            ))}
          </ul>
        ))}

      {podZakladka === 'frekwencja' && (
        <>
          <p className="frekwencja-licznik">
            Nieusprawiedliwione nieobecności w tym roku szkolnym:{' '}
            <strong>{liczbaNieusprawiedliwionych}</strong>
          </p>
          {obecnosciUcznia.length === 0 ? (
            <p className="pusto">Brak nieobecności w tym roku szkolnym.</p>
          ) : (
            <div className="tabela-terminow-kontener">
              <table className="tabela-terminow">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Przedmiot</th>
                    <th>Typ</th>
                  </tr>
                </thead>
                <tbody>
                  {obecnosciUcznia.map((o) => (
                    <tr key={o.id}>
                      <td>{dlugaData(new Date(`${o.data}T12:00:00`))}</td>
                      <td className="tytul-terminu">{o.przedmiot}</td>
                      <td>
                        <span
                          className={`status-terminu ${czyNieusprawiedliwiona(o) ? 'status-przeterminowany' : 'status-aktywny'}`}
                        >
                          {o.nazwaTypu}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
