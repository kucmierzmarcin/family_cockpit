import { useMemo } from 'react'
import type { DomownikDb } from '../lib/supabase'
import type { Wydarzenie } from '../useWydarzenia'
import { dniWydarzenia, godzinaHM, wJednymDniu } from '../czas'
import { DNI_TYGODNIA, klucz } from '../dates'
import { kolor } from '../kolory'

/** Ile pigułek mieści się w komórce dnia, zanim zaczniemy zwijać w "+N więcej". */
const PIGULEK_W_DNIU = 3

type Props = {
  dni: { data: Date; wTymMiesiacu: boolean }[]
  wydarzenia: Wydarzenie[]
  osobaPoId: Map<string, DomownikDb>
  dzisiaj: Date
  wybranyDzien: string
  ladowanie: boolean
  onWybierzDzien: (klucz: string) => void
}

/** Siatka miesiąca. Wydarzenie wielodniowe pojawia się w każdym zajętym dniu. */
export function Miesiac({
  dni,
  wydarzenia,
  osobaPoId,
  dzisiaj,
  wybranyDzien,
  ladowanie,
  onWybierzDzien,
}: Props) {
  // Wydarzenie trwające tydzień musi trafić do siedmiu komórek, więc grupujemy
  // po wszystkich zajętych dniach, nie po samej dacie rozpoczęcia.
  const wgDaty = useMemo(() => {
    const mapa = new Map<string, Wydarzenie[]>()
    for (const w of wydarzenia) {
      for (const dzien of dniWydarzenia(w)) {
        const lista = mapa.get(dzien)
        if (lista) lista.push(w)
        else mapa.set(dzien, [w])
      }
    }
    return mapa
  }, [wydarzenia])

  function stylPigulki(w: Wydarzenie) {
    const osoba = w.osobaId ? osobaPoId.get(w.osobaId) : undefined
    if (!osoba) return { background: '#eeedf2', color: '#4a4553' }
    const k = kolor(osoba.color)
    return { background: k.tlo, color: k.tekst }
  }

  return (
    <>
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
              onClick={() => onWybierzDzien(k)}
              aria-pressed={k === wybranyDzien}
            >
              <span className="numer">{data.getDate()}</span>
              <span className="wydarzenia">
                {lista.slice(0, PIGULEK_W_DNIU).map((w) => (
                  <span
                    key={w.id}
                    className={`pigulka${w.calodniowe || !wJednymDniu(w) ? ' ciagle' : ''}`}
                    style={stylPigulki(w)}
                    title={w.tytul}
                  >
                    {!w.calodniowe && wJednymDniu(w) && <b>{godzinaHM(w.start)}</b>}
                    {w.tytul}
                  </span>
                ))}
                {lista.length > PIGULEK_W_DNIU && (
                  <span className="wiecej">+{lista.length - PIGULEK_W_DNIU} więcej</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
