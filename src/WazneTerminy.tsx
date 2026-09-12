import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { DomownikDb } from './lib/supabase'
import { useTerminy } from './useTerminy'
import {
  DOZWOLONE_TYPY_ZALACZNIKA,
  bladZalacznika,
  czyPrzeterminowany,
  formatujTermin,
  posortujTerminy,
  type Termin,
  type Zalacznik,
} from './terminy'
import { klucz } from './dates'
import { kolor } from './kolory'
import { Arkusz } from './uklad/Arkusz'
import type { TrybDodawania } from './uklad/nawigacja'

type Props = {
  jestemRodzicem: boolean
  mojeId: string
  householdId: string
  osobaPoId: Map<string, DomownikDb>
  onBlad: (tekst: string) => void
  dodawanie: TrybDodawania
}

/** Ekran „Terminy": ważne daty (np. koniec ubezpieczenia) z załącznikami. */
export function Terminy({ jestemRodzicem, mojeId, householdId, osobaPoId, onBlad, dodawanie }: Props) {
  const dane = useTerminy(householdId, onBlad)
  const [pokazZalatwione, setPokazZalatwione] = useState(false)

  const dzisiaj = klucz(new Date())
  const widoczne = useMemo(
    () => posortujTerminy(dane.terminy.filter((t) => pokazZalatwione || !t.zalatwiony)),
    [dane.terminy, pokazZalatwione],
  )

  function wgrajZWalidacja(terminId: string, plik: File) {
    const blad = bladZalacznika(plik)
    if (blad) {
      onBlad(blad)
      return
    }
    void dane.wgrajZalacznik(terminId, plik)
  }

  async function otworzZalacznik(zalacznik: Zalacznik) {
    const okno = window.open('', '_blank', 'noopener')
    const url = await dane.linkDoZalacznika(zalacznik)
    if (url && okno) {
      okno.location.href = url
    } else {
      okno?.close()
    }
  }

  return (
    <div className="terminy">
      {dodawanie === null ? (
        <FormularzTerminu onDodaj={dane.dodaj} />
      ) : (
        <Arkusz otwarty={dodawanie.otwarte} tytul="Nowy termin" onZamknij={dodawanie.onZamknij}>
          <FormularzTerminu onDodaj={dane.dodaj} onDodano={dodawanie.onZamknij} />
        </Arkusz>
      )}

      <label className="przelacznik-zalatwionych">
        <input
          type="checkbox"
          checked={pokazZalatwione}
          onChange={(e) => setPokazZalatwione(e.target.checked)}
        />
        Pokaż załatwione
      </label>

      {dane.ladowanie ? (
        <p className="pusto">Wczytuję…</p>
      ) : widoczne.length === 0 ? (
        <p className="pusto">Brak terminów do pokazania.</p>
      ) : (
        <ul className="karty-terminow">
          {widoczne.map((t) => (
            <KartaTerminu
              key={t.id}
              termin={t}
              autor={t.autorId ? osobaPoId.get(t.autorId) : undefined}
              przeterminowany={!t.zalatwiony && czyPrzeterminowany(t.termin, dzisiaj)}
              mogeUsunacTermin={jestemRodzicem || t.autorId === mojeId}
              mojeId={mojeId}
              jestemRodzicem={jestemRodzicem}
              onPrzelacz={() => void dane.przelaczZalatwiony(t)}
              onUsunTermin={() => void dane.usunTermin(t)}
              onWgrajZalacznik={(plik) => wgrajZWalidacja(t.id, plik)}
              onUsunZalacznik={(z) => void dane.usunZalacznik(z)}
              onOtworzZalacznik={(z) => void otworzZalacznik(z)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

type KartaTerminuProps = {
  termin: Termin
  autor: DomownikDb | undefined
  przeterminowany: boolean
  mogeUsunacTermin: boolean
  mojeId: string
  jestemRodzicem: boolean
  onPrzelacz: () => void
  onUsunTermin: () => void
  onWgrajZalacznik: (plik: File) => void
  onUsunZalacznik: (zalacznik: Zalacznik) => void
  onOtworzZalacznik: (zalacznik: Zalacznik) => void
}

function KartaTerminu({
  termin,
  autor,
  przeterminowany,
  mogeUsunacTermin,
  mojeId,
  jestemRodzicem,
  onPrzelacz,
  onUsunTermin,
  onWgrajZalacznik,
  onUsunZalacznik,
  onOtworzZalacznik,
}: KartaTerminuProps) {
  const wejscie = useRef<HTMLInputElement>(null)

  function wybranoPliki(e: ChangeEvent<HTMLInputElement>) {
    const pliki = e.target.files
    if (!pliki) return
    for (const plik of Array.from(pliki)) onWgrajZalacznik(plik)
    e.target.value = ''
  }

  return (
    <li
      className={`karta-terminu${przeterminowany ? ' przeterminowany' : ''}${
        termin.zalatwiony ? ' zalatwiony' : ''
      }`}
    >
      <label className="zalatwiony-checkbox">
        <input type="checkbox" checked={termin.zalatwiony} onChange={onPrzelacz} />
        <span className="tytul-terminu">{termin.tytul}</span>
      </label>

      {przeterminowany && <span className="znacznik-przeterminowania">Przeterminowany</span>}

      {termin.opis && <p className="opis-terminu">{termin.opis}</p>}

      <p className="data-terminu">Do {formatujTermin(termin.termin)}</p>

      {termin.zalaczniki.length > 0 && (
        <ul className="zalaczniki-terminu">
          {termin.zalaczniki.map((z) => (
            <li key={z.id} className="zalacznik-terminu">
              <button type="button" className="drobny" onClick={() => onOtworzZalacznik(z)}>
                📎 {z.nazwaPliku}
              </button>
              {(jestemRodzicem || z.autorId === mojeId) && (
                <button
                  type="button"
                  className="usun"
                  aria-label={`Usuń załącznik ${z.nazwaPliku}`}
                  onClick={() => onUsunZalacznik(z)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="stopka-terminu">
        <span className="autor-karteczki">
          {autor && (
            <span
              className="kropka"
              style={{ background: kolor(autor.color).kropka }}
              aria-hidden="true"
            />
          )}
          {autor?.name ?? 'ktoś'}
        </span>

        <button type="button" className="drobny" onClick={() => wejscie.current?.click()}>
          + Załącznik
        </button>
        <input
          ref={wejscie}
          type="file"
          accept={DOZWOLONE_TYPY_ZALACZNIKA.join(',')}
          multiple
          hidden
          onChange={wybranoPliki}
        />

        {mogeUsunacTermin && (
          <button type="button" className="usun" aria-label="Usuń termin" onClick={onUsunTermin}>
            ×
          </button>
        )}
      </div>
    </li>
  )
}

type FormularzTerminuProps = {
  onDodaj: (tytul: string, opis: string, data: string) => Promise<string | null>
  onDodano?: () => void
}

/** Pole nowego terminu. Osobny komponent, bo raz siedzi w stronie, a raz w arkuszu. */
function FormularzTerminu({ onDodaj, onDodano }: FormularzTerminuProps) {
  const [tytul, setTytul] = useState('')
  const [opis, setOpis] = useState('')
  const [data, setData] = useState('')
  const [zapisywanie, setZapisywanie] = useState(false)
  const pole = useRef<HTMLInputElement>(null)

  async function wyslij(e: FormEvent) {
    e.preventDefault()
    if (!tytul.trim() || !data) return

    setZapisywanie(true)
    const id = await onDodaj(tytul.trim(), opis.trim(), data)
    setZapisywanie(false)

    if (id) {
      setTytul('')
      setOpis('')
      setData('')
      pole.current?.focus()
      onDodano?.()
    }
  }

  return (
    <form className="karta formularz-terminu" onSubmit={(e) => void wyslij(e)}>
      <label htmlFor="tytul-terminu">Nowy termin</label>
      <input
        id="tytul-terminu"
        ref={pole}
        value={tytul}
        onChange={(e) => setTytul(e.target.value)}
        placeholder="np. Ubezpieczenie auta"
        maxLength={200}
      />

      <label htmlFor="opis-terminu">Opis (opcjonalnie)</label>
      <textarea
        id="opis-terminu"
        value={opis}
        onChange={(e) => setOpis(e.target.value)}
        placeholder="np. OC i AC w Warcie"
        maxLength={500}
        rows={2}
      />

      <label htmlFor="data-terminu">Do kiedy</label>
      <input id="data-terminu" type="date" value={data} onChange={(e) => setData(e.target.value)} />

      <button type="submit" disabled={zapisywanie || !tytul.trim() || !data}>
        {zapisywanie ? 'Zapisuję…' : 'Dodaj termin'}
      </button>
    </form>
  )
}
