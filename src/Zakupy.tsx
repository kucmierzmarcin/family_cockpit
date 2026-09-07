import { useMemo, useRef, useState } from 'react'
import { useZakupy } from './useZakupy'
import { policzPozostale, posortujPozycje, saOdhaczone, type Pozycja } from './pozycje'
import { Arkusz } from './uklad/Arkusz'
import type { TrybDodawania } from './uklad/nawigacja'

type Props = {
  jestemRodzicem: boolean
  mojeId: string
  onBlad: (tekst: string) => void
  dodawanie: TrybDodawania
}

/** Ekran „Zakupy": listy domu i ich pozycje, odświeżane na żywo. */
export function Zakupy({ jestemRodzicem, mojeId, onBlad, dodawanie }: Props) {
  const dane = useZakupy(onBlad)
  const [klikniete, setKlikniete] = useState<string | null>(null)
  const [nowaLista, setNowaLista] = useState('')
  const [pokazFormularzListy, setPokazFormularzListy] = useState(false)

  // Wybraną listę liczymy podczas renderu, a nie efektem: pierwsza wybiera się
  // sama, a gdy ktoś usunie tę oglądaną, wracamy na pierwszą dostępną.
  const wybrana =
    klikniete && dane.listy.some((l) => l.id === klikniete)
      ? klikniete
      : (dane.listy[0]?.id ?? null)
  const setWybrana = setKlikniete

  const pozycjeListy = useMemo(
    () => posortujPozycje(dane.pozycje.filter((p) => p.listaId === wybrana)),
    [dane.pozycje, wybrana],
  )

  const licznikiList = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const lista of dane.listy) {
      mapa.set(lista.id, policzPozostale(dane.pozycje.filter((p) => p.listaId === lista.id)))
    }
    return mapa
  }, [dane.listy, dane.pozycje])

  async function dodajListe(e: React.FormEvent) {
    e.preventDefault()
    const nazwa = nowaLista.trim()
    if (!nazwa) return
    if (await dane.dodajListe(nazwa)) {
      setNowaLista('')
      setPokazFormularzListy(false)
      dodawanie?.onZamknij()
    }
  }

  if (dane.ladowanie) {
    return (
      <div className="karta">
        <p className="pusto">Wczytuję…</p>
      </div>
    )
  }

  const wybranaLista = dane.listy.find((l) => l.id === wybrana)

  return (
    <div className="zakupy">
      <div className="listy-pasek">
        {dane.listy.map((lista) => {
          const zostalo = licznikiList.get(lista.id) ?? 0
          const aktywna = lista.id === wybrana
          return (
            <button
              key={lista.id}
              type="button"
              className={`zakladka${aktywna ? ' aktywna' : ''}`}
              aria-pressed={aktywna}
              onClick={() => setWybrana(lista.id)}
            >
              {lista.nazwa}
              {zostalo > 0 && <span className="licznik">{zostalo}</span>}
            </button>
          )
        })}

        {jestemRodzicem && !pokazFormularzListy && (
          <button
            type="button"
            className="drobny"
            onClick={() => setPokazFormularzListy(true)}
          >
            + Nowa lista
          </button>
        )}
      </div>

      {pokazFormularzListy && (
        <form className="formularz-listy" onSubmit={(e) => void dodajListe(e)}>
          <input
            value={nowaLista}
            onChange={(e) => setNowaLista(e.target.value)}
            placeholder="np. Ogród"
            maxLength={40}
            aria-label="Nazwa nowej listy"
          />
          <button type="submit" disabled={!nowaLista.trim()}>
            Dodaj
          </button>
          <button
            type="button"
            className="drobny"
            onClick={() => {
              setPokazFormularzListy(false)
              setNowaLista('')
            }}
          >
            Anuluj
          </button>
        </form>
      )}

      {!wybranaLista ? (
        <div className="karta">
          <p className="pusto">Nie ma jeszcze żadnej listy.</p>
          {dodawanie !== null && (
            <Arkusz otwarty={dodawanie.otwarte} tytul="Nowa lista" onZamknij={dodawanie.onZamknij}>
              {jestemRodzicem ? (
                <form className="formularz-listy" onSubmit={(e) => void dodajListe(e)}>
                  <input
                    value={nowaLista}
                    onChange={(e) => setNowaLista(e.target.value)}
                    placeholder="np. Ogród"
                    maxLength={40}
                    aria-label="Nazwa nowej listy"
                  />
                  <button type="submit" disabled={!nowaLista.trim()}>
                    Dodaj
                  </button>
                </form>
              ) : (
                <p className="pusto">Poczekaj, aż rodzic założy pierwszą listę.</p>
              )}
            </Arkusz>
          )}
        </div>
      ) : (
        <section className="karta">
          <div className="naglowek-listy">
            <h2 className="panel-tytul">{wybranaLista.nazwa}</h2>
            <span className="meta">
              {pozycjeListy.length === 0
                ? 'pusta'
                : `${policzPozostale(pozycjeListy)} do kupienia z ${pozycjeListy.length}`}
            </span>

            {saOdhaczone(pozycjeListy) && (
              <button
                type="button"
                className="drobny"
                onClick={() => void dane.wyczyscOdhaczone(wybranaLista.id)}
              >
                Wyczyść odhaczone
              </button>
            )}
            {jestemRodzicem && dane.listy.length > 1 && (
              <button
                type="button"
                className="usun"
                aria-label={`Usuń listę ${wybranaLista.nazwa}`}
                onClick={() => void dane.usunListe(wybranaLista.id)}
              >
                ×
              </button>
            )}
          </div>

          {pozycjeListy.length === 0 ? (
            <p className="pusto">Nic tu jeszcze nie ma. Dopisz pierwszą rzecz.</p>
          ) : (
            <ul className="pozycje">
              {pozycjeListy.map((p) => (
                <WierszPozycji
                  key={p.id}
                  pozycja={p}
                  mogeUsunac={jestemRodzicem || p.autorId === mojeId}
                  onPrzelacz={() => void dane.przelacz(p)}
                  onUsun={() => void dane.usunPozycje(p)}
                />
              ))}
            </ul>
          )}

          {/* Ten arkusz celowo się nie zamyka po zapisie - dopisywanie kilku pozycji
              z rzędu ma być szybkie, tak jak przy wpisywaniu ich inline na komputerze. */}
          {dodawanie === null ? (
            <FormularzPozycji listaId={wybranaLista.id} onDodaj={dane.dodajPozycje} />
          ) : (
            <Arkusz
              otwarty={dodawanie.otwarte}
              tytul={`Dodaj do listy: ${wybranaLista.nazwa}`}
              onZamknij={dodawanie.onZamknij}
            >
              <FormularzPozycji listaId={wybranaLista.id} onDodaj={dane.dodajPozycje} />
            </Arkusz>
          )}
        </section>
      )}
    </div>
  )
}

type WierszProps = {
  pozycja: Pozycja
  mogeUsunac: boolean
  onPrzelacz: () => void
  onUsun: () => void
}

function WierszPozycji({ pozycja, mogeUsunac, onPrzelacz, onUsun }: WierszProps) {
  return (
    <li className={pozycja.kupione ? 'kupione' : ''}>
      <label className="pozycja-tresc">
        <input type="checkbox" checked={pozycja.kupione} onChange={onPrzelacz} />
        <span className="pozycja-nazwa">{pozycja.nazwa}</span>
        {pozycja.ilosc && <span className="pozycja-ilosc">{pozycja.ilosc}</span>}
      </label>
      {mogeUsunac && (
        <button
          type="button"
          className="usun"
          aria-label={`Usuń ${pozycja.nazwa}`}
          onClick={onUsun}
        >
          ×
        </button>
      )}
    </li>
  )
}

type FormularzProps = {
  listaId: string
  onDodaj: (listaId: string, nazwa: string, ilosc: string) => Promise<boolean>
}

function FormularzPozycji({ listaId, onDodaj }: FormularzProps) {
  const [nazwa, setNazwa] = useState('')
  const [ilosc, setIlosc] = useState('')
  const [zapisywanie, setZapisywanie] = useState(false)
  const poleNazwy = useRef<HTMLInputElement>(null)

  async function wyslij(e: React.FormEvent) {
    e.preventDefault()
    const tekst = nazwa.trim()
    if (!tekst) return

    setZapisywanie(true)
    const udalo = await onDodaj(listaId, tekst, ilosc.trim())
    setZapisywanie(false)

    if (udalo) {
      setNazwa('')
      setIlosc('')
      // Kursor wraca do nazwy - dopisywanie kilku rzeczy z rzędu ma być szybkie.
      poleNazwy.current?.focus()
    }
  }

  return (
    <form className="formularz-pozycji" onSubmit={(e) => void wyslij(e)}>
      <input
        ref={poleNazwy}
        value={nazwa}
        onChange={(e) => setNazwa(e.target.value)}
        placeholder="Co kupić?"
        maxLength={80}
        aria-label="Nazwa pozycji"
      />
      <input
        value={ilosc}
        onChange={(e) => setIlosc(e.target.value)}
        placeholder="ile"
        maxLength={20}
        aria-label="Ilość (opcjonalnie)"
        className="pole-ilosci"
      />
      <button type="submit" disabled={zapisywanie || !nazwa.trim()}>
        Dodaj
      </button>
    </form>
  )
}
