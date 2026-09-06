import { useEffect, useMemo, useState } from 'react'
import { supabase, type WydarzenieDb } from './lib/supabase'
import {
  DNI_TYGODNIA,
  MIESIACE,
  dlugaData,
  godzina,
  klucz,
  siatkaMiesiaca,
} from './dates'
import './App.css'

function App() {
  const dzisiaj = useMemo(() => new Date(), [])

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
  const [zapisywanie, setZapisywanie] = useState(false)

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

  // Wydarzenia pogrupowane po dacie - szybki dostęp przy rysowaniu siatki.
  const wgDaty = useMemo(() => {
    const mapa = new Map<string, WydarzenieDb[]>()
    for (const w of wydarzenia) {
      const lista = mapa.get(w.event_date)
      if (lista) lista.push(w)
      else mapa.set(w.event_date, [w])
    }
    return mapa
  }, [wydarzenia])

  const wydarzeniaDnia = wgDaty.get(wybranyDzien) ?? []

  function przesunMiesiac(o: number) {
    setMiesiac((m) => new Date(m.getFullYear(), m.getMonth() + o, 1))
  }

  function wrocDoDzis() {
    setMiesiac(new Date(dzisiaj.getFullYear(), dzisiaj.getMonth(), 1))
    setWybranyDzien(klucz(dzisiaj))
  }

  async function dodaj(e: React.FormEvent) {
    e.preventDefault()
    const nazwa = tytul.trim()
    if (!nazwa) return

    setZapisywanie(true)
    const { data, error } = await supabase
      .from('events')
      .insert({
        title: nazwa,
        event_date: wybranyDzien,
        event_time: oGodzinie || null,
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

  const dataWybranego = new Date(`${wybranyDzien}T00:00:00`)

  return (
    <div className="kokpit">
      <header className="naglowek">
        <h1>Kokpit Rodzinny</h1>
        <p className="podtytul">Wspólny kalendarz całej rodziny</p>
      </header>

      {blad && (
        <p className="blad" role="alert">
          {blad}
        </p>
      )}

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
                      <span key={w.id} className="pigulka" title={w.title}>
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
              {wydarzeniaDnia.map((w) => (
                <li key={w.id}>
                  <span className="czas">{godzina(w.event_time) ?? '—'}</span>
                  <span className="nazwa">{w.title}</span>
                  <button
                    type="button"
                    className="usun"
                    onClick={() => void usun(w.id)}
                    aria-label={`Usuń wydarzenie ${w.title}`}
                  >
                    ×
                  </button>
                </li>
              ))}
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
            <button type="submit" disabled={zapisywanie || !tytul.trim()}>
              {zapisywanie ? 'Zapisuję…' : 'Dodaj do kalendarza'}
            </button>
          </form>
        </aside>
      </div>
    </div>
  )
}

export default App
