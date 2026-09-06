import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, type DomownikDb, type WydarzenieDb } from './lib/supabase'
import {
  DNI_TYGODNIA,
  MIESIACE,
  dlugaData,
  godzina,
  klucz,
  siatkaMiesiaca,
} from './dates'
import { MojDom } from './MojDom'
import { useDomownicy } from './useDomownicy'
import { wyloguj } from './auth/useSesja'
import { kolor } from './kolory'
import './App.css'

/** Klucz filtra dla wydarzeń, których nie przypisano nikomu. */
const BEZ_OSOBY = 'brak'

type Props = {
  /** Profil zalogowanego domownika - z niego biorą się uprawnienia. */
  profil: DomownikDb
  email: string
}

function App({ profil, email }: Props) {
  const dzisiaj = useMemo(() => new Date(), [])
  const jestemRodzicem = profil.role === 'rodzic'

  const [widok, setWidok] = useState<'kalendarz' | 'dom'>('kalendarz')

  // Który miesiąc oglądamy (zawsze pierwszy dzień miesiąca).
  const [miesiac, setMiesiac] = useState(
    () => new Date(dzisiaj.getFullYear(), dzisiaj.getMonth(), 1),
  )
  const [wybranyDzien, setWybranyDzien] = useState(() => klucz(dzisiaj))

  const [wydarzenia, setWydarzenia] = useState<WydarzenieDb[]>([])
  const [ladowanie, setLadowanie] = useState(true)
  const [blad, setBlad] = useState<string | null>(null)

  const [tytul, setTytul] = useState('')
  const [oGodzinie, setOGodzinie] = useState('')
  const [ktoId, setKtoId] = useState('')
  const [zapisywanie, setZapisywanie] = useState(false)

  // Kogo aktualnie nie pokazujemy w kalendarzu.
  const [ukryci, setUkryci] = useState<Set<string>>(() => new Set())

  const osoby = useDomownicy(setBlad)

  const dni = useMemo(
    () => siatkaMiesiaca(miesiac.getFullYear(), miesiac.getMonth()),
    [miesiac],
  )

  // Pobieramy tylko wydarzenia z widocznego zakresu dat.
  const odDo = useMemo(
    () => ({ od: klucz(dni[0].data), do: klucz(dni[dni.length - 1].data) }),
    [dni],
  )

  useEffect(() => {
    // Przy szybkim przeklikiwaniu miesięcy odpowiedzi mogą wrócić w innej
    // kolejności niż zapytania - `aktualne` pilnuje, by wygrała ta najnowsza.
    let aktualne = true
    // oxlint-disable-next-line react/set-state-in-effect -- pobieranie danych z zewnętrznego API
    setLadowanie(true)

    void (async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('event_date', odDo.od)
        .lte('event_date', odDo.do)
        .order('event_date')
        .order('event_time', { nullsFirst: true })

      if (!aktualne) return

      if (error) {
        setBlad(`Nie udało się wczytać wydarzeń: ${error.message}`)
      } else {
        setBlad(null)
        setWydarzenia(data ?? [])
      }
      setLadowanie(false)
    })()

    return () => {
      aktualne = false
    }
  }, [odDo])

  // Filtr działa po stronie przeglądarki - wydarzenia miesiąca i tak już mamy.
  const widoczne = useMemo(
    () => wydarzenia.filter((w) => !ukryci.has(w.member_id ?? BEZ_OSOBY)),
    [wydarzenia, ukryci],
  )

  // Wydarzenia pogrupowane po dacie - szybki dostęp przy rysowaniu siatki.
  const wgDaty = useMemo(() => {
    const mapa = new Map<string, WydarzenieDb[]>()
    for (const w of widoczne) {
      const lista = mapa.get(w.event_date)
      if (lista) lista.push(w)
      else mapa.set(w.event_date, [w])
    }
    return mapa
  }, [widoczne])

  // Domownik po id - do pigułek w siatce i podpisów w panelu dnia.
  const osobaPoId = useMemo(
    () => new Map(osoby.domownicy.map((d) => [d.id, d])),
    [osoby.domownicy],
  )

  const wydarzeniaDnia = wgDaty.get(wybranyDzien) ?? []

  function przesunMiesiac(o: number) {
    setMiesiac((m) => new Date(m.getFullYear(), m.getMonth() + o, 1))
  }

  function wrocDoDzis() {
    setMiesiac(new Date(dzisiaj.getFullYear(), dzisiaj.getMonth(), 1))
    setWybranyDzien(klucz(dzisiaj))
  }

  function przelaczFiltr(id: string) {
    setUkryci((stare) => {
      const nowe = new Set(stare)
      if (nowe.has(id)) nowe.delete(id)
      else nowe.add(id)
      return nowe
    })
  }

  /**
   * Te same warunki co w regule RLS na usuwanie. Ukrywamy przycisk, żeby nikt
   * nie klikał w coś, co baza i tak odrzuci - ale to baza jest tu strażnikiem.
   */
  function mogeUsunac(w: WydarzenieDb) {
    return jestemRodzicem || w.created_by === profil.id || w.member_id === profil.id
  }

  /** Barwy pigułki: kolor domownika, a dla wydarzeń niczyich - neutralna szarość. */
  function stylPigulki(memberId: string | null) {
    const osoba = memberId ? osobaPoId.get(memberId) : undefined
    if (!osoba) return { background: '#eeedf2', color: '#4a4553' }
    const k = kolor(osoba.color)
    return { background: k.tlo, color: k.tekst }
  }

  async function dodaj(e: React.FormEvent) {
    e.preventDefault()
    const nazwa = tytul.trim()
    if (!nazwa) return

    setZapisywanie(true)
    // `household_id` i `created_by` uzupełnia baza wartościami domyślnymi.
    const { data, error } = await supabase
      .from('events')
      .insert({
        title: nazwa,
        event_date: wybranyDzien,
        event_time: oGodzinie || null,
        member_id: ktoId || null,
      })
      .select()
      .single()

    if (error) {
      setBlad(`Nie udało się zapisać wydarzenia: ${error.message}`)
    } else if (data) {
      setBlad(null)
      setWydarzenia((stare) => [...stare, data])
      setTytul('')
      setOGodzinie('')
    }
    setZapisywanie(false)
  }

  async function usun(id: string) {
    const kopia = wydarzenia
    setWydarzenia((stare) => stare.filter((w) => w.id !== id)) // od razu znika z ekranu

    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) {
      setWydarzenia(kopia) // nie wyszło - przywracamy
      setBlad(`Nie udało się usunąć wydarzenia: ${error.message}`)
    }
  }

  /**
   * Usunięcie domownika zdejmuje przypisanie z jego wydarzeń (w bazie robi to
   * `on delete set null`), więc odzwierciedlamy to też na ekranie.
   */
  const usunDomownika = useCallback(
    (id: string) => {
      void osoby.usun(id)
      setWydarzenia((stare) =>
        stare.map((w) => (w.member_id === id ? { ...w, member_id: null } : w)),
      )
      setKtoId((biezacy) => (biezacy === id ? '' : biezacy))
    },
    [osoby],
  )

  const dataWybranego = new Date(`${wybranyDzien}T00:00:00`)

  return (
    <div className="kokpit">
      <header className="naglowek">
        <div className="pasek">
          <nav className="zakladki" aria-label="Widok">
            <button
              type="button"
              className={`zakladka${widok === 'kalendarz' ? ' aktywna' : ''}`}
              aria-pressed={widok === 'kalendarz'}
              onClick={() => setWidok('kalendarz')}
            >
              Kalendarz
            </button>
            <button
              type="button"
              className={`zakladka${widok === 'dom' ? ' aktywna' : ''}`}
              aria-pressed={widok === 'dom'}
              onClick={() => setWidok('dom')}
            >
              Mój dom
            </button>
          </nav>

          <div className="konto">
            <span className="konto-kto">
              <span
                className="kropka"
                style={{ background: kolor(profil.color).kropka }}
                aria-hidden="true"
              />
              {profil.name}
              <span className="meta">{email}</span>
            </span>
            <button type="button" className="drobny" onClick={() => void wyloguj()}>
              Wyloguj
            </button>
          </div>
        </div>

        <h1>Kokpit Rodzinny</h1>
        <p className="podtytul">Wspólny kalendarz całej rodziny</p>
      </header>

      {blad && (
        <p className="blad" role="alert">
          {blad}
        </p>
      )}

      {widok === 'dom' ? (
        <MojDom
          domownicy={osoby.domownicy}
          ladowanie={osoby.ladowanie}
          jestemRodzicem={jestemRodzicem}
          mojeId={profil.id}
          proponowanyKolor={osoby.proponowanyKolor}
          onDodaj={osoby.dodaj}
          onZmien={osoby.zmien}
          onUsun={usunDomownika}
        />
      ) : (
        <div className="uklad">
          <section className="kalendarz" aria-label="Kalendarz miesięczny">
            <div className="sterowanie">
              <button
                type="button"
                className="strzalka"
                onClick={() => przesunMiesiac(-1)}
                aria-label="Poprzedni miesiąc"
              >
                ‹
              </button>
              <h2 className="miesiac">
                {MIESIACE[miesiac.getMonth()]} {miesiac.getFullYear()}
              </h2>
              <button
                type="button"
                className="strzalka"
                onClick={() => przesunMiesiac(1)}
                aria-label="Następny miesiąc"
              >
                ›
              </button>
              <button type="button" className="dzis" onClick={wrocDoDzis}>
                Dziś
              </button>
            </div>

            {osoby.domownicy.length > 0 && (
              <div className="filtry" role="group" aria-label="Pokaż wydarzenia osób">
                {osoby.domownicy.map((d) => {
                  const widac = !ukryci.has(d.id)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={`filtr${widac ? ' wlaczony' : ''}`}
                      aria-pressed={widac}
                      onClick={() => przelaczFiltr(d.id)}
                    >
                      <span
                        className="kropka"
                        style={{ background: kolor(d.color).kropka }}
                        aria-hidden="true"
                      />
                      {d.name}
                    </button>
                  )
                })}
                <button
                  type="button"
                  className={`filtr${!ukryci.has(BEZ_OSOBY) ? ' wlaczony' : ''}`}
                  aria-pressed={!ukryci.has(BEZ_OSOBY)}
                  onClick={() => przelaczFiltr(BEZ_OSOBY)}
                >
                  <span className="kropka kropka-pusta" aria-hidden="true" />
                  Bez osoby
                </button>
              </div>
            )}

            <div className="dni-tygodnia" aria-hidden="true">
              {DNI_TYGODNIA.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>

            <div className={`siatka${ladowanie ? ' wczytywanie' : ''}`}>
              {dni.map(({ data, wTymMiesiacu }) => {
                const k = klucz(data)
                const lista = wgDaty.get(k) ?? []
                const klasy = [
                  'dzien',
                  wTymMiesiacu ? '' : 'obcy',
                  k === klucz(dzisiaj) ? 'dzisiaj' : '',
                  k === wybranyDzien ? 'wybrany' : '',
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <button
                    type="button"
                    key={k}
                    className={klasy}
                    onClick={() => setWybranyDzien(k)}
                    aria-pressed={k === wybranyDzien}
                  >
                    <span className="numer">{data.getDate()}</span>
                    <span className="wydarzenia">
                      {lista.slice(0, 3).map((w) => (
                        <span
                          key={w.id}
                          className="pigulka"
                          style={stylPigulki(w.member_id)}
                          title={w.title}
                        >
                          {godzina(w.event_time) && <b>{godzina(w.event_time)}</b>}
                          {w.title}
                        </span>
                      ))}
                      {lista.length > 3 && (
                        <span className="wiecej">+{lista.length - 3} więcej</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <aside className="panel" aria-label="Wydarzenia wybranego dnia">
            <h2 className="panel-tytul">{dlugaData(dataWybranego)}</h2>
            <p className="panel-dzien">
              {dataWybranego.toLocaleDateString('pl-PL', { weekday: 'long' })}
            </p>

            {wydarzeniaDnia.length === 0 ? (
              <p className="pusto">Brak wydarzeń tego dnia.</p>
            ) : (
              <ul className="lista">
                {wydarzeniaDnia.map((w) => {
                  const osoba = w.member_id ? osobaPoId.get(w.member_id) : undefined
                  return (
                    <li key={w.id}>
                      <span className="czas">{godzina(w.event_time) ?? '—'}</span>
                      <span className="nazwa">
                        {w.title}
                        {osoba && (
                          <span className="autor">
                            <span
                              className="kropka"
                              style={{ background: kolor(osoba.color).kropka }}
                              aria-hidden="true"
                            />
                            {osoba.name}
                          </span>
                        )}
                      </span>
                      {mogeUsunac(w) && (
                        <button
                          type="button"
                          className="usun"
                          onClick={() => void usun(w.id)}
                          aria-label={`Usuń wydarzenie ${w.title}`}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            <form className="formularz" onSubmit={(e) => void dodaj(e)}>
              <label htmlFor="tytul">Nowe wydarzenie</label>
              <input
                id="tytul"
                value={tytul}
                onChange={(e) => setTytul(e.target.value)}
                placeholder="np. Wizyta u dentysty"
                maxLength={120}
              />
              <label htmlFor="godzina">Godzina (opcjonalnie)</label>
              <input
                id="godzina"
                type="time"
                value={oGodzinie}
                onChange={(e) => setOGodzinie(e.target.value)}
              />
              {osoby.domownicy.length > 0 && (
                <>
                  <label htmlFor="kto">Kto</label>
                  <select
                    id="kto"
                    value={ktoId}
                    onChange={(e) => setKtoId(e.target.value)}
                  >
                    <option value="">Bez osoby</option>
                    {osoby.domownicy.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button type="submit" disabled={zapisywanie || !tytul.trim()}>
                {zapisywanie ? 'Zapisuję…' : 'Dodaj do kalendarza'}
              </button>
            </form>
          </aside>
        </div>
      )}
    </div>
  )
}

export default App
