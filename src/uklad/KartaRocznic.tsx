import { useState } from 'react'
import {
  OPCJE_TYPU,
  dzienPoprawny,
  formatujDataRocznicy,
  ikonaTypu,
  nazwaTypu,
  posortujRocznice,
  type Rocznica,
  type TypRocznicy,
} from '../rocznice'
import { Wczytywanie } from './Wczytywanie'

const NAZWY_MIESIECY = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]

type DaneRocznicy = { tytul: string; typ: TypRocznicy; dzien: number; miesiac: number; rok: number | null }

type Props = {
  rocznice: Rocznica[]
  ladowanie: boolean
  mojeId: string
  jestemRodzicem: boolean
  onDodaj: (tytul: string, typ: TypRocznicy, dzien: number, miesiac: number, rok: number | null) => Promise<boolean>
  onEdytuj: (
    id: string,
    tytul: string,
    typ: TypRocznicy,
    dzien: number,
    miesiac: number,
    rok: number | null,
  ) => Promise<boolean>
  onUsun: (id: string) => Promise<boolean>
}

/** Karta w "Mój dom": tabela rocznic + formularz dodawania w linii (bez wyskakującego okna). */
export function KartaRocznic({ rocznice, ladowanie, mojeId, jestemRodzicem, onDodaj, onEdytuj, onUsun }: Props) {
  const [edytowanaId, setEdytowanaId] = useState<string | null>(null)
  const [dodawanie, setDodawanie] = useState(false)
  const posortowane = posortujRocznice(rocznice)

  return (
    <section className="karta">
      <h2 className="panel-tytul">Ważne rocznice</h2>
      <p className="panel-dzien">
        Urodziny, imieniny i rocznice - dodane tutaj pojawią się w kalendarzu co roku.
      </p>

      {ladowanie ? (
        <Wczytywanie wierszy={3} />
      ) : posortowane.length === 0 ? (
        <p className="pusto">Nie dodano jeszcze żadnej rocznicy.</p>
      ) : (
        <div className="tabela-rocznic-kontener">
          <table className="tabela-rocznic">
            <thead>
              <tr>
                <th>Tytuł</th>
                <th>Typ</th>
                <th>Data</th>
                <th>Rok</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {posortowane.map((r) =>
                edytowanaId === r.id ? (
                  <tr key={r.id}>
                    <td colSpan={5}>
                      <FormularzRocznicy
                        poczatkowe={r}
                        etykietaZapisu="Zapisz"
                        onZapisz={(dane) => onEdytuj(r.id, dane.tytul, dane.typ, dane.dzien, dane.miesiac, dane.rok)}
                        onZapisano={() => setEdytowanaId(null)}
                        onAnuluj={() => setEdytowanaId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td>
                      {ikonaTypu(r.typ)} {r.tytul}
                    </td>
                    <td>{nazwaTypu(r.typ)}</td>
                    <td>{formatujDataRocznicy(r.dzien, r.miesiac)}</td>
                    <td>{r.rok ?? '—'}</td>
                    <td>
                      {(jestemRodzicem || r.autorId === mojeId) && (
                        <>
                          <button type="button" className="drobny" onClick={() => setEdytowanaId(r.id)}>
                            Edytuj
                          </button>
                          <button
                            type="button"
                            className="usun"
                            aria-label={`Usuń rocznicę ${r.tytul}`}
                            onClick={() => void onUsun(r.id)}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {dodawanie ? (
        <FormularzRocznicy
          etykietaZapisu="Dodaj rocznicę"
          onZapisz={(dane) => onDodaj(dane.tytul, dane.typ, dane.dzien, dane.miesiac, dane.rok)}
          onZapisano={() => setDodawanie(false)}
          onAnuluj={() => setDodawanie(false)}
        />
      ) : (
        <button type="button" className="drobny" onClick={() => setDodawanie(true)}>
          + Dodaj rocznicę
        </button>
      )}
    </section>
  )
}

type FormularzProps = {
  /** Gdy podane, formularz jest w trybie edycji - wypełniony obecnymi wartościami. */
  poczatkowe?: Rocznica
  etykietaZapisu: string
  onZapisz: (dane: DaneRocznicy) => Promise<boolean>
  onZapisano: () => void
  onAnuluj: () => void
}

function FormularzRocznicy({ poczatkowe, etykietaZapisu, onZapisz, onZapisano, onAnuluj }: FormularzProps) {
  const idPrefix = poczatkowe?.id ?? 'nowa'
  const [tytul, setTytul] = useState(poczatkowe?.tytul ?? '')
  const [typ, setTyp] = useState<TypRocznicy>(poczatkowe?.typ ?? 'urodziny')
  const [dzien, setDzien] = useState(poczatkowe?.dzien ?? 1)
  const [miesiac, setMiesiac] = useState(poczatkowe?.miesiac ?? 1)
  const [rok, setRok] = useState(poczatkowe?.rok?.toString() ?? '')
  const [zapisywanie, setZapisywanie] = useState(false)
  const [blad, setBlad] = useState<string | null>(null)

  async function wyslij(e: React.FormEvent) {
    e.preventDefault()
    const t = tytul.trim()
    if (!t) return
    if (!dzienPoprawny(dzien, miesiac)) {
      setBlad('Nieprawidłowy dzień dla wybranego miesiąca.')
      return
    }
    setBlad(null)
    setZapisywanie(true)
    const udalo = await onZapisz({ tytul: t, typ, dzien, miesiac, rok: rok.trim() ? Number(rok) : null })
    setZapisywanie(false)
    if (udalo) onZapisano()
  }

  return (
    <form className="karta formularz" onSubmit={(e) => void wyslij(e)}>
      <label htmlFor={`tytul-rocznicy-${idPrefix}`}>Tytuł</label>
      <input
        id={`tytul-rocznicy-${idPrefix}`}
        value={tytul}
        onChange={(e) => setTytul(e.target.value)}
        placeholder="np. Zuzia"
        maxLength={100}
      />

      <label htmlFor={`typ-rocznicy-${idPrefix}`}>Typ</label>
      <select
        id={`typ-rocznicy-${idPrefix}`}
        value={typ}
        onChange={(e) => setTyp(e.target.value as TypRocznicy)}
      >
        {OPCJE_TYPU.map((o) => (
          <option key={o.wartosc} value={o.wartosc}>
            {o.etykieta}
          </option>
        ))}
      </select>

      <label htmlFor={`dzien-rocznicy-${idPrefix}`}>Dzień</label>
      <input
        id={`dzien-rocznicy-${idPrefix}`}
        type="number"
        min={1}
        max={31}
        value={dzien}
        onChange={(e) => setDzien(Number(e.target.value))}
      />

      <label htmlFor={`miesiac-rocznicy-${idPrefix}`}>Miesiąc</label>
      <select
        id={`miesiac-rocznicy-${idPrefix}`}
        value={miesiac}
        onChange={(e) => setMiesiac(Number(e.target.value))}
      >
        {NAZWY_MIESIECY.map((nazwa, i) => (
          <option key={nazwa} value={i + 1}>
            {nazwa}
          </option>
        ))}
      </select>

      <label htmlFor={`rok-rocznicy-${idPrefix}`}>Rok (opcjonalnie)</label>
      <input
        id={`rok-rocznicy-${idPrefix}`}
        type="number"
        min={1900}
        max={2100}
        value={rok}
        onChange={(e) => setRok(e.target.value)}
        placeholder="np. 2016"
      />

      {blad && (
        <p className="blad" role="alert">
          {blad}
        </p>
      )}

      <div className="akcje-formularza">
        <button type="submit" disabled={zapisywanie || !tytul.trim()}>
          {zapisywanie ? 'Zapisuję…' : etykietaZapisu}
        </button>
        <button type="button" className="drobny" onClick={onAnuluj}>
          Anuluj
        </button>
      </div>
    </form>
  )
}
