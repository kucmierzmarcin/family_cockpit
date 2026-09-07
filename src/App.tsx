import { useCallback, useMemo, useState } from 'react'
import type { DomownikDb } from './lib/supabase'
import {
  MIESIACE,
  dlugaData,
  klucz,
  poczatekTygodnia,
  siatkaMiesiaca,
  tydzienOd,
} from './dates'
import { nastepnyDzien, opisCzasu, poczatekDnia } from './czas'
import { MojDom } from './MojDom'
import { Zakupy } from './Zakupy'
import { Tablica } from './Tablica'
import { Miesiac } from './widoki/Miesiac'
import { Tydzien } from './widoki/Tydzien'
import { Dzien } from './widoki/Dzien'
import { FormularzWydarzenia } from './FormularzWydarzenia'
import { useDomownicy } from './useDomownicy'
import { useWydarzenia, type Wydarzenie } from './useWydarzenia'
import { BEZ_OSOBY, osobyWydarzenia, widocznePrzyFiltrze } from './osoby'
import { kolor } from './kolory'
import { TYTULY, type Ekran, type TrybDodawania } from './uklad/nawigacja'
import { useTelefon } from './uklad/useTelefon'
import { UkladBiurko } from './uklad/UkladBiurko'
import { UkladTelefon } from './uklad/UkladTelefon'
import { KontoKarta } from './uklad/KontoKarta'
import { Arkusz } from './uklad/Arkusz'
import { SterowanieKalendarza, type Widok } from './widoki/SterowanieKalendarza'
import './style/index.css'

type Props = {
  /** Profil zalogowanego domownika - z niego biorą się uprawnienia. */
  profil: DomownikDb
  email: string
}

function App({ profil, email }: Props) {
  const dzisiaj = useMemo(() => new Date(), [])
  const jestemRodzicem = profil.role === 'rodzic'

  const [ekran, setEkran] = useState<Ekran>('kalendarz')
  const [widok, setWidok] = useState<Widok>('miesiac')

  // Jedna data odniesienia dla wszystkich trzech widoków - każdy bierze z niej
  // swój zakres, więc przełączanie widoku nie gubi miejsca w kalendarzu.
  const [kotwica, setKotwica] = useState(() => new Date())

  const [blad, setBlad] = useState<string | null>(null)
  const [ukryci, setUkryci] = useState<Set<string>>(() => new Set())
  const [edytowane, setEdytowane] = useState<Wydarzenie | null>(null)
  // Rośnie po każdym zapisie - zmienia `key` formularza, więc ten wraca do
  // pustych pól zamiast zostawiać poprzednie wydarzenie do przypadkowego
  // dodania drugi raz.
  const [licznikZapisow, setLicznikZapisow] = useState(0)

  const osoby = useDomownicy(setBlad)
  const telefon = useTelefon()
  const [dodawanie, setDodawanie] = useState<Ekran | null>(null)

  // Na telefonie formularz danego ekranu siedzi w arkuszu sterowanym stąd; na
  // komputerze zawsze `null`, czyli wbudowany wprost w stronę jak dziś.
  const trybDodawania = (dla: Ekran): TrybDodawania =>
    telefon ? { otwarte: dodawanie === dla, onZamknij: () => setDodawanie(null) } : null

  const dniMiesiaca = useMemo(
    () => siatkaMiesiaca(kotwica.getFullYear(), kotwica.getMonth()),
    [kotwica],
  )
  const dniTygodnia = useMemo(() => tydzienOd(kotwica), [kotwica])

  // Zakres pobierania danych zależy od tego, co widać na ekranie.
  const { od, doKiedy } = useMemo(() => {
    if (widok === 'miesiac') {
      return {
        od: poczatekDnia(dniMiesiaca[0].data),
        doKiedy: nastepnyDzien(dniMiesiaca[dniMiesiaca.length - 1].data),
      }
    }
    if (widok === 'tydzien') {
      return { od: poczatekTygodnia(kotwica), doKiedy: nastepnyDzien(dniTygodnia[6]) }
    }
    return { od: poczatekDnia(kotwica), doKiedy: nastepnyDzien(kotwica) }
  }, [widok, kotwica, dniMiesiaca, dniTygodnia])

  const dane = useWydarzenia(od, doKiedy, setBlad)

  // Filtr działa po stronie przeglądarki - wydarzenia zakresu i tak już mamy.
  // Wydarzenie zostaje, dopóki widoczny jest choć jeden z jego uczestników.
  const widoczne = useMemo(
    () => dane.wydarzenia.filter((w) => widocznePrzyFiltrze(w.osobyId, ukryci)),
    [dane.wydarzenia, ukryci],
  )

  const osobaPoId = useMemo(
    () => new Map(osoby.domownicy.map((d) => [d.id, d])),
    [osoby.domownicy],
  )

  function przesun(o: number) {
    setKotwica((k) => {
      if (widok === 'miesiac') return new Date(k.getFullYear(), k.getMonth() + o, 1)
      const dni = widok === 'tydzien' ? 7 : 1
      return new Date(k.getFullYear(), k.getMonth(), k.getDate() + o * dni)
    })
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
  function mogeUsunac(w: Wydarzenie) {
    return jestemRodzicem || w.autorId === profil.id || w.osobyId.includes(profil.id)
  }

  const usunDomownika = useCallback(
    (id: string) => {
      void osoby.usun(id)
    },
    [osoby],
  )

  const naglowek = useMemo(() => {
    if (widok === 'miesiac') return `${MIESIACE[kotwica.getMonth()]} ${kotwica.getFullYear()}`
    if (widok === 'dzien') {
      return `${dlugaData(kotwica)} ${kotwica.getFullYear()}`
    }
    const pierwszy = dniTygodnia[0]
    const ostatni = dniTygodnia[6]
    return `${dlugaData(pierwszy)} – ${dlugaData(ostatni)}`
  }, [widok, kotwica, dniTygodnia])

  const formularzWydarzenia = (
    <FormularzWydarzenia
      key={`${edytowane?.id ?? klucz(kotwica)}-${licznikZapisow}`}
      domownicy={osoby.domownicy}
      wydarzenie={edytowane ?? undefined}
      domyslnyDzien={kotwica}
      mogeUsunac={edytowane ? mogeUsunac(edytowane) : false}
      onZapisz={async (daneWyd, powtarzanie, powtarzajDo, zakres) => {
        const udalo = edytowane
          ? await dane.zmien(edytowane, daneWyd, zakres)
          : await dane.dodaj(daneWyd, powtarzanie, powtarzajDo)
        if (udalo) setLicznikZapisow((n) => n + 1)
        return udalo
      }}
      onUsun={edytowane ? (zakres) => void dane.usun(edytowane, zakres) : undefined}
      onZamknij={() => setEdytowane(null)}
    />
  )

  const tresc = (
    <>
      {blad && (
        <p className="blad" role="alert">
          {blad}
        </p>
      )}

      {ekran === 'dom' && telefon && <KontoKarta profil={profil} email={email} />}

      {ekran === 'zakupy' ? (
        <Zakupy
          jestemRodzicem={jestemRodzicem}
          mojeId={profil.id}
          onBlad={setBlad}
          dodawanie={trybDodawania('zakupy')}
        />
      ) : ekran === 'tablica' ? (
        <Tablica
          jestemRodzicem={jestemRodzicem}
          mojeId={profil.id}
          osobaPoId={osobaPoId}
          onBlad={setBlad}
          dodawanie={trybDodawania('tablica')}
        />
      ) : ekran === 'dom' ? (
        <MojDom
          domownicy={osoby.domownicy}
          ladowanie={osoby.ladowanie}
          jestemRodzicem={jestemRodzicem}
          mojeId={profil.id}
          proponowanyKolor={osoby.proponowanyKolor}
          onDodaj={osoby.dodaj}
          onZmien={osoby.zmien}
          onUsun={usunDomownika}
          dodawanie={trybDodawania('dom')}
        />
      ) : (
        <div className="uklad">
          <section className="kalendarz" aria-label="Kalendarz">
            {!telefon && (
              <SterowanieKalendarza
                naglowek={naglowek}
                widok={widok}
                onWidok={setWidok}
                onPrzesun={przesun}
                onDzis={() => setKotwica(new Date())}
              />
            )}

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

            {widok === 'miesiac' && (
              <Miesiac
                dni={dniMiesiaca}
                wydarzenia={widoczne}
                osobaPoId={osobaPoId}
                dzisiaj={dzisiaj}
                wybranyDzien={klucz(kotwica)}
                ladowanie={dane.ladowanie}
                onWybierzDzien={(k) => {
                  setKotwica(new Date(`${k}T12:00:00`))
                  setEdytowane(null)
                }}
              />
            )}

            {widok === 'tydzien' && (
              <Tydzien
                dni={dniTygodnia}
                wydarzenia={widoczne}
                osobaPoId={osobaPoId}
                dzisiaj={dzisiaj}
                onKlikWydarzenie={setEdytowane}
                onKlikDzien={(d) => {
                  setKotwica(d)
                  setWidok('dzien')
                }}
              />
            )}

            {widok === 'dzien' && (
              <Dzien
                dzien={kotwica}
                wydarzenia={widoczne}
                osobaPoId={osobaPoId}
                dzisiaj={dzisiaj}
                onKlikWydarzenie={setEdytowane}
              />
            )}
          </section>

          <aside className="panel" aria-label="Szczegóły dnia">
            {widok === 'miesiac' && !edytowane && (
              <ListaDnia
                dzien={kotwica}
                wydarzenia={widoczne}
                osobaPoId={osobaPoId}
                onKlik={setEdytowane}
              />
            )}

            {telefon ? (
              <Arkusz
                otwarty={dodawanie === 'kalendarz' || edytowane !== null}
                tytul={edytowane ? 'Wydarzenie' : 'Nowe wydarzenie'}
                onZamknij={() => {
                  setDodawanie(null)
                  setEdytowane(null)
                }}
              >
                {formularzWydarzenia}
              </Arkusz>
            ) : (
              formularzWydarzenia
            )}
          </aside>
        </div>
      )}
    </>
  )

  if (telefon) {
    return (
      <UkladTelefon
        ekran={ekran}
        onEkran={setEkran}
        jestemRodzicem={jestemRodzicem}
        gorny={
          ekran === 'kalendarz' ? (
            <SterowanieKalendarza
              naglowek={naglowek}
              widok={widok}
              onWidok={setWidok}
              onPrzesun={przesun}
              onDzis={() => setKotwica(new Date())}
            />
          ) : (
            <h1 className="tytul-ekranu">{TYTULY[ekran]}</h1>
          )
        }
        onDodaj={() => setDodawanie(ekran)}
        dodawanieOtwarte={dodawanie !== null}
      >
        {tresc}
      </UkladTelefon>
    )
  }

  return (
    <UkladBiurko profil={profil} email={email} ekran={ekran} onEkran={setEkran}>
      {tresc}
    </UkladBiurko>
  )
}

type ListaProps = {
  dzien: Date
  wydarzenia: Wydarzenie[]
  osobaPoId: Map<string, DomownikDb>
  onKlik: (w: Wydarzenie) => void
}

/** Wydarzenia wybranego dnia - widoczne obok siatki miesiąca. */
function ListaDnia({ dzien, wydarzenia, osobaPoId, onKlik }: ListaProps) {
  const poczatek = poczatekDnia(dzien)
  const koniec = nastepnyDzien(dzien)
  const tegoDnia = wydarzenia
    .filter((w) => w.start < koniec && w.koniec > poczatek)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  return (
    <>
      <h2 className="panel-tytul">{dlugaData(dzien)}</h2>
      <p className="panel-dzien">{dzien.toLocaleDateString('pl-PL', { weekday: 'long' })}</p>

      {tegoDnia.length === 0 ? (
        <p className="pusto">Brak wydarzeń tego dnia.</p>
      ) : (
        <ul className="lista">
          {tegoDnia.map((w) => {
            const uczestnicy = osobyWydarzenia(w.osobyId, osobaPoId)
            return (
              <li key={w.id}>
                <button type="button" className="wpis" onClick={() => onKlik(w)}>
                  <span className="czas">{opisCzasu(w, w.calodniowe)}</span>
                  <span className="nazwa">
                    {w.tytul}
                    {uczestnicy.length > 0 && (
                      <span className="uczestnicy">
                        {uczestnicy.map((o) => (
                          <span key={o.id} className="autor">
                            <span
                              className="kropka"
                              style={{ background: kolor(o.color).kropka }}
                              aria-hidden="true"
                            />
                            {o.name}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export default App
