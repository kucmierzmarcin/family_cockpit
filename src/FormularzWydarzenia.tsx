import { useState } from 'react'
import type { DomownikDb } from './lib/supabase'
import type { DaneWydarzenia, Wydarzenie, ZakresZmiany } from './useWydarzenia'
import { OPISY_POWTARZANIA, godzinaHM, zloz, type Powtarzanie } from './czas'
import { klucz } from './dates'
import { kolor } from './kolory'

const POWTARZANIA: Powtarzanie[] = ['brak', 'tydzien', 'dwa-tygodnie', 'miesiac']

/** Godziny podpowiadane dla nowego wydarzenia. */
const DOMYSLNY_POCZATEK = '09:00'
const DOMYSLNY_KONIEC = '10:00'

type Props = {
  domownicy: DomownikDb[]
  /** Podane = edycja istniejącego wydarzenia; puste = nowe. */
  wydarzenie?: Wydarzenie
  /** Dzień, na który zakładamy nowe wydarzenie. */
  domyslnyDzien: Date
  mogeUsunac: boolean
  onZapisz: (
    dane: DaneWydarzenia,
    powtarzanie: Powtarzanie,
    powtarzajDo: Date,
    zakres: ZakresZmiany,
  ) => Promise<boolean>
  onUsun?: (zakres: ZakresZmiany) => void
  onZamknij: () => void
  /** Czy pokazać własny nagłówek. Domyślnie tak - na komputerze to jedyny tytuł;
   * na telefonie Arkusz już pokazuje ten sam tekst w swoim pasku, więc App.tsx
   * przekazuje tu `false`. */
  pokazTytul?: boolean
}

/** Rozbija chwilę na parę pól formularza: datę i godzinę. */
function rozbij(d: Date) {
  return { data: klucz(d), godzina: godzinaHM(d) }
}

/** Dzień o jeden wcześniej - koniec całodniowego jest wyłączny. */
function ostatniDzienCalodniowego(koniec: Date): Date {
  return new Date(koniec.getTime() - 1)
}

export function FormularzWydarzenia({
  domownicy,
  wydarzenie,
  domyslnyDzien,
  mogeUsunac,
  onZapisz,
  onUsun,
  onZamknij,
  pokazTytul = true,
}: Props) {
  const edycja = Boolean(wydarzenie)
  const wSerii = Boolean(wydarzenie?.seriaId)

  const [tytul, setTytul] = useState(wydarzenie?.tytul ?? '')
  const [calodniowe, setCalodniowe] = useState(wydarzenie?.calodniowe ?? false)
  const [osobyId, setOsobyId] = useState<string[]>(wydarzenie?.osobyId ?? [])

  const startowy = wydarzenie
    ? rozbij(wydarzenie.start)
    : { data: klucz(domyslnyDzien), godzina: DOMYSLNY_POCZATEK }

  const koncowy = wydarzenie
    ? wydarzenie.calodniowe
      ? rozbij(ostatniDzienCalodniowego(wydarzenie.koniec))
      : rozbij(wydarzenie.koniec)
    : { data: klucz(domyslnyDzien), godzina: DOMYSLNY_KONIEC }

  const [dataOd, setDataOd] = useState(startowy.data)
  const [godzOd, setGodzOd] = useState(startowy.godzina)
  const [dataDo, setDataDo] = useState(koncowy.data)
  const [godzDo, setGodzDo] = useState(koncowy.godzina)

  const [powtarzanie, setPowtarzanie] = useState<Powtarzanie>('brak')
  const [powtarzajDo, setPowtarzajDo] = useState(() => {
    const zaRok = new Date(domyslnyDzien)
    zaRok.setFullYear(zaRok.getFullYear() + 1)
    return klucz(zaRok)
  })

  const [zakres, setZakres] = useState<ZakresZmiany>('tylko-to')
  const [zapisywanie, setZapisywanie] = useState(false)
  const [blad, setBlad] = useState<string | null>(null)

  function przelaczOsobe(id: string) {
    setOsobyId((stare) =>
      stare.includes(id) ? stare.filter((x) => x !== id) : [...stare, id],
    )
  }

  /** Przesuwa koniec za początkiem, żeby nie zostawał w tyle. */
  function zmienPoczatek(nowaData: string) {
    setDataOd(nowaData)
    if (dataDo < nowaData) setDataDo(nowaData)
  }

  function policzPrzedzial(): { start: Date; koniec: Date } | string {
    if (calodniowe) {
      const start = zloz(dataOd, '00:00')
      // Koniec jest wyłączny, więc doba po ostatnim dniu.
      const ostatni = zloz(dataDo, '00:00')
      const koniec = new Date(ostatni.getFullYear(), ostatni.getMonth(), ostatni.getDate() + 1)
      if (koniec <= start) return 'Ostatni dzień nie może być wcześniejszy niż pierwszy.'
      return { start, koniec }
    }

    const start = zloz(dataOd, godzOd)
    const koniec = zloz(dataDo, godzDo)
    if (koniec <= start) return 'Koniec musi być późniejszy niż początek.'
    return { start, koniec }
  }

  async function wyslij(e: React.FormEvent) {
    e.preventDefault()
    const nazwa = tytul.trim()
    if (!nazwa) return

    const przedzial = policzPrzedzial()
    if (typeof przedzial === 'string') {
      setBlad(przedzial)
      return
    }

    setBlad(null)
    setZapisywanie(true)
    const udalo = await onZapisz(
      {
        tytul: nazwa,
        start: przedzial.start,
        koniec: przedzial.koniec,
        calodniowe,
        osobyId,
      },
      powtarzanie,
      zloz(powtarzajDo, '23:59'),
      zakres,
    )
    setZapisywanie(false)
    if (udalo) onZamknij()
  }

  return (
    <form className="formularz formularz-wydarzenia" onSubmit={(e) => void wyslij(e)}>
      {pokazTytul && (
        <h2 className="panel-tytul">{edycja ? 'Zmień wydarzenie' : 'Nowe wydarzenie'}</h2>
      )}

      {blad && (
        <p className="blad" role="alert">
          {blad}
        </p>
      )}

      <label htmlFor="w-tytul">Tytuł</label>
      <input
        id="w-tytul"
        value={tytul}
        onChange={(e) => setTytul(e.target.value)}
        placeholder="np. Wizyta u dentysty"
        maxLength={120}
      />

      <label className="przelacznik">
        <input
          type="checkbox"
          checked={calodniowe}
          onChange={(e) => setCalodniowe(e.target.checked)}
        />
        Cały dzień
      </label>

      <label htmlFor="w-data-od">{calodniowe ? 'Pierwszy dzień' : 'Początek'}</label>
      <div className="para-pol">
        <input
          id="w-data-od"
          type="date"
          value={dataOd}
          onChange={(e) => zmienPoczatek(e.target.value)}
        />
        {!calodniowe && (
          <input
            type="time"
            aria-label="Godzina rozpoczęcia"
            value={godzOd}
            onChange={(e) => setGodzOd(e.target.value)}
          />
        )}
      </div>

      <label htmlFor="w-data-do">{calodniowe ? 'Ostatni dzień' : 'Koniec'}</label>
      <div className="para-pol">
        <input
          id="w-data-do"
          type="date"
          value={dataDo}
          min={dataOd}
          onChange={(e) => setDataDo(e.target.value)}
        />
        {!calodniowe && (
          <input
            type="time"
            aria-label="Godzina zakończenia"
            value={godzDo}
            onChange={(e) => setGodzDo(e.target.value)}
          />
        )}
      </div>

      {domownicy.length > 0 && (
        <>
          <span className="etykieta-koloru" id="w-kto">
            Kto bierze udział
          </span>
          <div className="wybor-osob" role="group" aria-labelledby="w-kto">
            {domownicy.map((d) => {
              const wybrany = osobyId.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  className={`filtr${wybrany ? ' wlaczony' : ''}`}
                  aria-pressed={wybrany}
                  onClick={() => przelaczOsobe(d.id)}
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
          </div>
          {osobyId.length === 0 && (
            <span className="wskazowka">Nikt nie zaznaczony - wydarzenie wspólne.</span>
          )}
        </>
      )}

      {!edycja && (
        <>
          <label htmlFor="w-powtarzanie">Powtarzanie</label>
          <select
            id="w-powtarzanie"
            value={powtarzanie}
            onChange={(e) => setPowtarzanie(e.target.value as Powtarzanie)}
          >
            {POWTARZANIA.map((p) => (
              <option key={p} value={p}>
                {OPISY_POWTARZANIA[p]}
              </option>
            ))}
          </select>

          {powtarzanie !== 'brak' && (
            <>
              <label htmlFor="w-powtarzaj-do">Powtarzaj do</label>
              <input
                id="w-powtarzaj-do"
                type="date"
                value={powtarzajDo}
                min={dataOd}
                onChange={(e) => setPowtarzajDo(e.target.value)}
              />
              <span className="wskazowka">
                Wystąpienia powstają od razu. Każde da się później zmienić osobno.
              </span>
            </>
          )}
        </>
      )}

      {edycja && wSerii && (
        <>
          <span className="etykieta-koloru" id="w-zakres">
            To wydarzenie należy do serii
          </span>
          <div className="wybor-zakresu" role="radiogroup" aria-labelledby="w-zakres">
            <label className="przelacznik">
              <input
                type="radio"
                name="zakres"
                checked={zakres === 'tylko-to'}
                onChange={() => setZakres('tylko-to')}
              />
              Tylko to wystąpienie
            </label>
            <label className="przelacznik">
              <input
                type="radio"
                name="zakres"
                checked={zakres === 'to-i-kolejne'}
                onChange={() => setZakres('to-i-kolejne')}
              />
              To i wszystkie kolejne
            </label>
          </div>
        </>
      )}

      <button type="submit" disabled={zapisywanie || !tytul.trim()}>
        {zapisywanie ? 'Zapisuję…' : edycja ? 'Zapisz zmiany' : 'Dodaj do kalendarza'}
      </button>

      {edycja && mogeUsunac && onUsun && (
        <button
          type="button"
          className="drugi usuwanie"
          onClick={() => {
            onUsun(zakres)
            onZamknij()
          }}
        >
          {wSerii && zakres === 'to-i-kolejne' ? 'Usuń to i kolejne' : 'Usuń wydarzenie'}
        </button>
      )}

      <button type="button" className="drugi" onClick={onZamknij}>
        {edycja ? 'Anuluj' : 'Zamknij'}
      </button>
    </form>
  )
}
