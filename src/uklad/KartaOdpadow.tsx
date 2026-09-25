import { useState } from 'react'
import { formatujTermin } from '../terminy'
import {
  OPCJE_RODZAJU,
  ikonaRodzaju,
  nazwaRodzaju,
  posortujTerminyOdpadow,
  type RodzajOdpadow,
  type TerminOdbioru,
} from '../odpady'
import { Wczytywanie } from './Wczytywanie'

type DaneTerminu = { rodzaj: RodzajOdpadow; data: string }

type Props = {
  terminy: TerminOdbioru[]
  ladowanie: boolean
  mojeId: string
  jestemRodzicem: boolean
  onDodaj: (rodzaje: RodzajOdpadow[], data: string) => Promise<boolean>
  onEdytuj: (id: string, rodzaj: RodzajOdpadow, data: string) => Promise<boolean>
  onUsun: (id: string) => Promise<boolean>
}

/** Karta w "Mój dom": tabela terminów odbioru odpadów + formularz dodawania w linii. */
export function KartaOdpadow({ terminy, ladowanie, mojeId, jestemRodzicem, onDodaj, onEdytuj, onUsun }: Props) {
  const [edytowanyId, setEdytowanyId] = useState<string | null>(null)
  const [dodawanie, setDodawanie] = useState(false)
  const posortowane = posortujTerminyOdpadow(terminy)

  return (
    <section className="karta">
      <h2 className="panel-tytul">Odbiór odpadów</h2>
      <p className="panel-dzien">
        Terminy odbioru z harmonogramu gminy - dodane tutaj pojawią się w kalendarzu w dniu
        odbioru i jako przypomnienie dzień wcześniej.
      </p>

      {ladowanie ? (
        <Wczytywanie wierszy={3} />
      ) : posortowane.length === 0 ? (
        <p className="pusto">Nie dodano jeszcze żadnego terminu.</p>
      ) : (
        <div className="tabela-rocznic-kontener">
          <table className="tabela-rocznic">
            <thead>
              <tr>
                <th>Rodzaj</th>
                <th>Data</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {posortowane.map((t) =>
                edytowanyId === t.id ? (
                  <tr key={t.id}>
                    <td colSpan={3}>
                      <FormularzTerminu
                        poczatkowe={t}
                        etykietaZapisu="Zapisz"
                        onZapisz={(dane) => onEdytuj(t.id, dane.rodzaj, dane.data)}
                        onZapisano={() => setEdytowanyId(null)}
                        onAnuluj={() => setEdytowanyId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id}>
                    <td>
                      {ikonaRodzaju(t.rodzaj)} {nazwaRodzaju(t.rodzaj)}
                    </td>
                    <td>{formatujTermin(t.data)}</td>
                    <td>
                      {(jestemRodzicem || t.autorId === mojeId) && (
                        <>
                          <button type="button" className="drobny" onClick={() => setEdytowanyId(t.id)}>
                            Edytuj
                          </button>
                          <button
                            type="button"
                            className="usun"
                            aria-label={`Usuń termin odbioru ${nazwaRodzaju(t.rodzaj)}`}
                            onClick={() => void onUsun(t.id)}
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
        <FormularzDodawania
          onZapisz={onDodaj}
          onZapisano={() => setDodawanie(false)}
          onAnuluj={() => setDodawanie(false)}
        />
      ) : (
        <button type="button" className="drobny" onClick={() => setDodawanie(true)}>
          + Dodaj termin odbioru
        </button>
      )}
    </section>
  )
}

type FormularzDodawaniaProps = {
  onZapisz: (rodzaje: RodzajOdpadow[], data: string) => Promise<boolean>
  onZapisano: () => void
  onAnuluj: () => void
}

/** Dodawanie terminu: jedna data, kilka zaznaczonych rodzajow naraz - tego
 * samego dnia gmina czesto odbiera wiecej niz jeden rodzaj odpadow. */
function FormularzDodawania({ onZapisz, onZapisano, onAnuluj }: FormularzDodawaniaProps) {
  const [rodzaje, setRodzaje] = useState<RodzajOdpadow[]>([])
  const [data, setData] = useState('')
  const [zapisywanie, setZapisywanie] = useState(false)

  function przelacz(rodzaj: RodzajOdpadow) {
    setRodzaje((biezace) =>
      biezace.includes(rodzaj) ? biezace.filter((r) => r !== rodzaj) : [...biezace, rodzaj],
    )
  }

  async function wyslij(e: React.FormEvent) {
    e.preventDefault()
    if (!data || rodzaje.length === 0) return
    setZapisywanie(true)
    const udalo = await onZapisz(rodzaje, data)
    setZapisywanie(false)
    if (udalo) onZapisano()
  }

  return (
    <form className="formularz" onSubmit={(e) => void wyslij(e)}>
      <label htmlFor="data-odbioru-nowy">Data odbioru</label>
      <input
        id="data-odbioru-nowy"
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
      />

      <span className="etykieta-koloru" id="rodzaje-odbioru-nowy-etykieta">
        Rodzaje odpadów tego dnia
      </span>
      <div role="group" aria-labelledby="rodzaje-odbioru-nowy-etykieta">
        {OPCJE_RODZAJU.map((o) => (
          <label key={o.wartosc} className="przelacznik">
            <input
              type="checkbox"
              checked={rodzaje.includes(o.wartosc)}
              onChange={() => przelacz(o.wartosc)}
            />
            {ikonaRodzaju(o.wartosc)} {o.etykieta}
          </label>
        ))}
      </div>

      <button type="submit" disabled={zapisywanie || !data || rodzaje.length === 0}>
        {zapisywanie ? 'Zapisuję…' : 'Dodaj termin'}
      </button>
      <button type="button" className="drugi" onClick={onAnuluj}>
        Anuluj
      </button>
    </form>
  )
}

type FormularzProps = {
  /** Gdy podane, formularz jest w trybie edycji - wypełniony obecnymi wartościami. */
  poczatkowe?: TerminOdbioru
  etykietaZapisu: string
  onZapisz: (dane: DaneTerminu) => Promise<boolean>
  onZapisano: () => void
  onAnuluj: () => void
}

function FormularzTerminu({ poczatkowe, etykietaZapisu, onZapisz, onZapisano, onAnuluj }: FormularzProps) {
  const idPrefix = poczatkowe?.id ?? 'nowy'
  const [rodzaj, setRodzaj] = useState<RodzajOdpadow>(poczatkowe?.rodzaj ?? 'papier')
  const [data, setData] = useState(poczatkowe?.data ?? '')
  const [zapisywanie, setZapisywanie] = useState(false)

  async function wyslij(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setZapisywanie(true)
    const udalo = await onZapisz({ rodzaj, data })
    setZapisywanie(false)
    if (udalo) onZapisano()
  }

  return (
    <form className="formularz" onSubmit={(e) => void wyslij(e)}>
      <label htmlFor={`rodzaj-odpadow-${idPrefix}`}>Rodzaj</label>
      <select
        id={`rodzaj-odpadow-${idPrefix}`}
        value={rodzaj}
        onChange={(e) => setRodzaj(e.target.value as RodzajOdpadow)}
      >
        {OPCJE_RODZAJU.map((o) => (
          <option key={o.wartosc} value={o.wartosc}>
            {o.etykieta}
          </option>
        ))}
      </select>

      <label htmlFor={`data-odbioru-${idPrefix}`}>Data odbioru</label>
      <input
        id={`data-odbioru-${idPrefix}`}
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
      />

      <button type="submit" disabled={zapisywanie || !data}>
        {zapisywanie ? 'Zapisuję…' : etykietaZapisu}
      </button>
      <button type="button" className="drugi" onClick={onAnuluj}>
        Anuluj
      </button>
    </form>
  )
}
