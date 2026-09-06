import { useMemo, useRef, useState } from 'react'
import type { DomownikDb } from './lib/supabase'
import { useTablica } from './useTablica'
import { kiedy, posortujNotatki, type Notatka } from './notatki'
import { kolor } from './kolory'

type Props = {
  jestemRodzicem: boolean
  mojeId: string
  osobaPoId: Map<string, DomownikDb>
  onBlad: (tekst: string) => void
}

/** Ekran „Tablica": rodzinne ogłoszenia na widoku. */
export function Tablica({ jestemRodzicem, mojeId, osobaPoId, onBlad }: Props) {
  const dane = useTablica(onBlad)
  const [tresc, setTresc] = useState('')
  const [zapisywanie, setZapisywanie] = useState(false)
  const pole = useRef<HTMLTextAreaElement>(null)

  // Jeden znacznik czasu na render: inaczej każda karteczka wołałaby `new Date()`
  // osobno i sąsiednie notatki mogłyby pokazać różny czas dla tej samej chwili.
  const teraz = new Date()

  const uporzadkowane = useMemo(() => posortujNotatki(dane.notatki), [dane.notatki])

  async function dodaj(e: React.FormEvent) {
    e.preventDefault()
    const tekst = tresc.trim()
    if (!tekst) return

    setZapisywanie(true)
    const udalo = await dane.dodaj(tekst)
    setZapisywanie(false)

    if (udalo) {
      setTresc('')
      pole.current?.focus()
    }
  }

  return (
    <div className="tablica">
      <form className="karta formularz-notatki" onSubmit={(e) => void dodaj(e)}>
        <label htmlFor="tresc-notatki">Nowa notatka</label>
        <textarea
          id="tresc-notatki"
          ref={pole}
          value={tresc}
          onChange={(e) => setTresc(e.target.value)}
          placeholder="np. W piątek nie ma szkoły"
          maxLength={500}
          rows={3}
        />
        <button type="submit" disabled={zapisywanie || !tresc.trim()}>
          {zapisywanie ? 'Przypinam…' : 'Powieś na tablicy'}
        </button>
      </form>

      {dane.ladowanie ? (
        <p className="pusto">Wczytuję…</p>
      ) : uporzadkowane.length === 0 ? (
        <p className="pusto">Tablica jest pusta. Powieś pierwszą kartkę.</p>
      ) : (
        <ul className="karteczki">
          {uporzadkowane.map((n) => (
            <Karteczka
              key={n.id}
              notatka={n}
              autor={n.autorId ? osobaPoId.get(n.autorId) : undefined}
              teraz={teraz}
              mogeUsunac={jestemRodzicem || n.autorId === mojeId}
              onPrzypnij={() => void dane.przypnij(n)}
              onUsun={() => void dane.usun(n)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

type KarteczkaProps = {
  notatka: Notatka
  autor: DomownikDb | undefined
  teraz: Date
  mogeUsunac: boolean
  onPrzypnij: () => void
  onUsun: () => void
}

function Karteczka({
  notatka,
  autor,
  teraz,
  mogeUsunac,
  onPrzypnij,
  onUsun,
}: KarteczkaProps) {
  // Przypięta karteczka bierze barwę autora - łatwiej ją wtedy wyłowić wzrokiem.
  const barwa = autor ? kolor(autor.color) : null

  return (
    <li
      className={`karteczka${notatka.przypieta ? ' przypieta' : ''}`}
      style={
        notatka.przypieta && barwa
          ? { borderTopColor: barwa.kropka, background: barwa.tlo }
          : undefined
      }
    >
      {notatka.przypieta && <span className="znacznik-przypiecia">Przypięta</span>}

      <p className="tresc-karteczki">{notatka.tresc}</p>

      <div className="stopka-karteczki">
        <span className="autor-karteczki">
          {autor && (
            <span
              className="kropka"
              style={{ background: kolor(autor.color).kropka }}
              aria-hidden="true"
            />
          )}
          {autor?.name ?? 'ktoś'} · {kiedy(notatka.dodano, teraz)}
        </span>

        <button
          type="button"
          className="drobny"
          aria-pressed={notatka.przypieta}
          onClick={onPrzypnij}
        >
          {notatka.przypieta ? 'Odepnij' : 'Przypnij'}
        </button>

        {mogeUsunac && (
          <button
            type="button"
            className="usun"
            aria-label="Usuń notatkę"
            onClick={onUsun}
          >
            ×
          </button>
        )}
      </div>
    </li>
  )
}
