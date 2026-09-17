import { useMemo } from 'react'
import type { DomownikDb } from '../lib/supabase'
import type { Wydarzenie } from '../useWydarzenia'
import { dniWydarzenia, godzinaHM, wJednymDniu } from '../czas'
import { DNI_TYGODNIA, klucz, opisLiczbyWydarzen, pelnaData } from '../dates'
import { barwyWydarzenia } from '../osoby'
import { KropkiOsob } from './KropkiOsob'
import { ulozKropki } from './kropkiMiesiaca'

type Props = {
  dni: { data: Date; wTymMiesiacu: boolean }[]
  wydarzenia: Wydarzenie[]
  osobaPoId: Map<string, DomownikDb>
  dzisiaj: Date
  wybranyDzien: string
  ladowanie: boolean
  onWybierzDzien: (klucz: string) => void
  /** Ile pigułek mieści się w komórce, zanim zwiniemy resztę w „+N więcej". */
  maksPigulek: number
  /**
   * Kropki zamiast pigułek. Na telefonie komórka dnia ma ~40px szerokości -
   * pigułka z godziną i tytułem ucinała się do „0…" albo „W…", czyli do zera
   * informacji. Kropka w barwie osoby mówi „tego dnia ktoś coś ma i kto" - a
   * *co*, pokazuje lista dnia, która na telefonie stoi pod siatką.
   */
  kropki?: boolean
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
  maksPigulek,
  kropki,
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

  // Barwy bierzemy od pierwszej przypisanej osoby; reszta pokazuje się kropkami.
  function stylPigulki(w: Wydarzenie) {
    const barwy = barwyWydarzenia(w.osobyId, osobaPoId)
    return { background: barwy.tlo, color: barwy.tekst }
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
              /* Bez tego nazwa przycisku to sklejka „17 08:00Dentysta+2 więcej" -
                 numer bez miesiąca i dnia tygodnia, bo pasek DNI_TYGODNIA jest
                 `aria-hidden`. Zawartość komórki (pigułki albo kropki) zostaje
                 wyłącznie wizualna: pełną listę dnia i tak otwiera kliknięcie. */
              aria-label={`${pelnaData(data)}, ${opisLiczbyWydarzen(lista.length)}`}
              aria-current={k === klucz(dzisiaj) ? 'date' : undefined}
            >
              <span className="numer">{data.getDate()}</span>
              {kropki ? (
                <KropkiDnia lista={lista} osobaPoId={osobaPoId} />
              ) : (
                <span className="wydarzenia">
                  {lista.slice(0, maksPigulek).map((w) => (
                    <span
                      key={w.id}
                      className={`pigulka${w.calodniowe || !wJednymDniu(w) ? ' ciagle' : ''}`}
                      style={stylPigulki(w)}
                      title={w.tytul}
                    >
                      {!w.calodniowe && wJednymDniu(w) && <b>{godzinaHM(w.start)}</b>}
                      {w.tytul}
                      <KropkiOsob osobyId={w.osobyId} osobaPoId={osobaPoId} />
                    </span>
                  ))}
                  {lista.length > maksPigulek && (
                    <span className="wiecej">+{lista.length - maksPigulek} więcej</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

const MAKS_KROPEK = 6

type KropkiProps = {
  lista: Wydarzenie[]
  osobaPoId: Map<string, DomownikDb>
}

/**
 * Komórka dnia na telefonie: po jednej kropce na wydarzenie, w barwie pierwszej
 * przypisanej osoby (`barwyWydarzenia` daje neutralny szary dla wydarzeń bez
 * nikogo). Całodniowe i wielodniowe dostają kreskę, nie kółko - tę różnicę
 * niosły pigułki klasą `.ciagle` i nie ma powodu jej gubić.
 *
 * Całość jest `aria-hidden`: dokładną liczbę wydarzeń niesie już `aria-label`
 * przycisku dnia, a czytanie ośmiu bezimiennych kropek to sam szum.
 */
function KropkiDnia({ lista, osobaPoId }: KropkiProps) {
  if (lista.length === 0) return null

  const { pokaz, nadmiar } = ulozKropki(lista.length, MAKS_KROPEK)

  return (
    <span className="kropki-dnia" aria-hidden="true">
      {lista.slice(0, pokaz).map((w) => (
        <span
          key={w.id}
          className={`kropka-dnia${w.calodniowe || !wJednymDniu(w) ? ' ciagla' : ''}`}
          style={{ background: barwyWydarzenia(w.osobyId, osobaPoId).kropka }}
        />
      ))}
      {nadmiar > 0 && <span className="kropki-nadmiar">+{nadmiar}</span>}
    </span>
  )
}
