import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useTerminy } from './useTerminy'
import {
  DOZWOLONE_TYPY_ZALACZNIKA,
  bladZalacznika,
  czyPrzeterminowany,
  dniPoTerminie,
  formatujTermin,
  posortujTerminy,
  type Termin,
  type Zalacznik,
} from './terminy'
import { klucz } from './dates'
import { Arkusz } from './uklad/Arkusz'
import { Popup } from './uklad/Popup'
import { useTelefon } from './uklad/useTelefon'
import type { TrybDodawania } from './uklad/nawigacja'
import { Wczytywanie } from './uklad/Wczytywanie'

type Props = {
  jestemRodzicem: boolean
  mojeId: string
  householdId: string
  onBlad: (tekst: string) => void
  dodawanie: TrybDodawania
}

type WartosciFormularza = { tytul: string; opis: string; data: string; powiadom: string | null }

/** Ekran „Terminy": ważne daty (np. koniec ubezpieczenia) z załącznikami, w tabeli. */
export function Terminy({ jestemRodzicem, mojeId, householdId, onBlad, dodawanie }: Props) {
  const dane = useTerminy(householdId, onBlad)
  const telefon = useTelefon()
  const [pokazZalatwione, setPokazZalatwione] = useState(false)
  const [edytowanyTermin, setEdytowanyTermin] = useState<Termin | null>(null)
  // Na telefonie dodawanie steruje FAB-em z powloki (prop `dodawanie`); na
  // komputerze ekran nie ma FAB-a, wiec wlasny przycisk otwiera ten sam Popup
  // co edycja.
  const [pokazDodawanieDesktop, setPokazDodawanieDesktop] = useState(false)

  const dzisiaj = klucz(new Date())
  const widoczne = useMemo(
    () => posortujTerminy(dane.terminy.filter((t) => pokazZalatwione || !t.zalatwiony)),
    [dane.terminy, pokazZalatwione],
  )

  async function zapiszTermin(wartosci: WartosciFormularza): Promise<boolean> {
    if (edytowanyTermin) {
      return dane.edytujTermin(
        edytowanyTermin.id,
        wartosci.tytul,
        wartosci.opis,
        wartosci.data,
        wartosci.powiadom,
      )
    }
    const id = await dane.dodaj(wartosci.tytul, wartosci.opis, wartosci.data, wartosci.powiadom)
    return id !== null
  }

  function wgrajZWalidacja(terminId: string, plik: File) {
    const blad = bladZalacznika(plik)
    if (blad) {
      onBlad(blad)
      return
    }
    void dane.wgrajZalacznik(terminId, plik)
  }

  async function otworzZalacznik(zalacznik: Zalacznik) {
    // Nie przekazujemy tu 'noopener' do window.open - przegladarka wtedy
    // ZAWSZE zwraca null jako uchwyt (udokumentowane zachowanie), wiec
    // nawigacja ponizej nigdy by sie nie wykonala. Zamiast tego zrywamy
    // opener recznie na zwroconym uchwycie - ten sam efekt bezpieczenstwa,
    // ale referencja zostaje zywa do pozniejszego ustawienia URL.
    const okno = window.open('', '_blank')
    if (okno) okno.opener = null
    const url = await dane.linkDoZalacznika(zalacznik)
    if (url && okno) {
      okno.location.href = url
    } else {
      okno?.close()
    }
  }

  // Ten sam formularz do dodawania i edycji, tak jak przy wydarzeniach w
  // kalendarzu - PowlokaEdycji to Arkusz na telefonie, Popup na komputerze
  // (identyczne propsy, więc wystarczy podmienić komponent).
  const PowlokaEdycji = telefon ? Arkusz : Popup

  return (
    <div className="terminy">
      {dodawanie === null ? (
        <>
          <button
            type="button"
            className="dodaj-wydarzenie-gorne"
            onClick={() => setPokazDodawanieDesktop(true)}
          >
            + Nowy termin
          </button>
          <Popup
            otwarty={pokazDodawanieDesktop}
            tytul="Nowy termin"
            onZamknij={() => setPokazDodawanieDesktop(false)}
          >
            <FormularzTerminu onZapisz={zapiszTermin} onZapisano={() => setPokazDodawanieDesktop(false)} />
          </Popup>
        </>
      ) : (
        <Arkusz otwarty={dodawanie.otwarte} tytul="Nowy termin" onZamknij={dodawanie.onZamknij}>
          <FormularzTerminu onZapisz={zapiszTermin} onZapisano={dodawanie.onZamknij} />
        </Arkusz>
      )}

      <PowlokaEdycji
        otwarty={edytowanyTermin !== null}
        tytul="Edytuj termin"
        onZamknij={() => setEdytowanyTermin(null)}
      >
        <FormularzTerminu
          key={edytowanyTermin?.id ?? 'brak'}
          edytowanyTermin={edytowanyTermin ?? undefined}
          onZapisz={zapiszTermin}
          onZapisano={() => setEdytowanyTermin(null)}
        />
      </PowlokaEdycji>

      <label className="przelacznik-zalatwionych">
        <input
          type="checkbox"
          checked={pokazZalatwione}
          onChange={(e) => setPokazZalatwione(e.target.checked)}
        />
        Pokaż załatwione
      </label>

      {dane.ladowanie ? (
        <Wczytywanie wierszy={4} />
      ) : widoczne.length === 0 ? (
        <p className="pusto">Brak terminów do pokazania.</p>
      ) : telefon ? (
        /* Tabela na 390px chowała 296 z 640 pikseli treści za przewijaniem w bok
           - a ucinała się kolumna „Do kiedy", czyli przy terminie rzecz
           najważniejsza. Te same dane, ten sam `WierszTerminu`-owy zestaw
           podkomponentów, tylko ułożone w pionie. */
        <ul className="karty-terminow">
          {widoczne.map((t) => (
            <KartaTerminu
              key={t.id}
              termin={t}
              dzisiaj={dzisiaj}
              przeterminowany={!t.zalatwiony && czyPrzeterminowany(t.termin, dzisiaj)}
              powiadomienieMinelo={t.powiadom !== null && czyPrzeterminowany(t.powiadom, dzisiaj)}
              mogeUsunacTermin={jestemRodzicem || t.autorId === mojeId}
              mojeId={mojeId}
              jestemRodzicem={jestemRodzicem}
              onEdytuj={() => setEdytowanyTermin(t)}
              onPrzelacz={() => void dane.przelaczZalatwiony(t)}
              onUsunTermin={() => void dane.usunTermin(t)}
              onWgrajZalacznik={(plik) => wgrajZWalidacja(t.id, plik)}
              onUsunZalacznik={(z) => void dane.usunZalacznik(z)}
              onOtworzZalacznik={(z) => void otworzZalacznik(z)}
            />
          ))}
        </ul>
      ) : (
        <div className="tabela-terminow-kontener">
          <table className="tabela-terminow">
            <thead>
              <tr>
                <th>Tytuł</th>
                <th>Opis</th>
                <th>Do kiedy</th>
                <th aria-label="Załączniki" />
                <th>Status</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {widoczne.map((t) => (
                <WierszTerminu
                  key={t.id}
                  termin={t}
                  dzisiaj={dzisiaj}
                  przeterminowany={!t.zalatwiony && czyPrzeterminowany(t.termin, dzisiaj)}
                  powiadomienieMinelo={t.powiadom !== null && czyPrzeterminowany(t.powiadom, dzisiaj)}
                  mogeUsunacTermin={jestemRodzicem || t.autorId === mojeId}
                  mojeId={mojeId}
                  jestemRodzicem={jestemRodzicem}
                  onEdytuj={() => setEdytowanyTermin(t)}
                  onPrzelacz={() => void dane.przelaczZalatwiony(t)}
                  onUsunTermin={() => void dane.usunTermin(t)}
                  onWgrajZalacznik={(plik) => wgrajZWalidacja(t.id, plik)}
                  onUsunZalacznik={(z) => void dane.usunZalacznik(z)}
                  onOtworzZalacznik={(z) => void otworzZalacznik(z)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function przesuniecie(kotwica: HTMLElement): { top: number; left: number } {
  const r = kotwica.getBoundingClientRect()
  return { top: r.bottom + 4, left: r.right }
}

/**
 * Panel wyskakujący z przycisku-kotwicy, wypychany portalem do `document.body`.
 * Bez tego byłby obcinany przez `.tabela-terminow-kontener` (overflow-x: auto
 * na jednej osi wymusza `auto` też na drugiej - panel wychodzący poza wysokość
 * kontenera po prostu by znikał albo dostawał pasek przewijania).
 */
function Wyskakujace({
  otwarte,
  kotwica,
  onZamknij,
  children,
}: {
  otwarte: boolean
  kotwica: RefObject<HTMLElement | null>
  onZamknij: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [pozycja, setPozycja] = useState<{ top: number; left: number } | null>(null)

  // Pozycja panelu zalezy od ukladu strony (getBoundingClientRect) - to
  // synchronizacja z zewnetrznym ukladem DOM, nie stan pochodny z propsow.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- mierzenie pozycji przycisku w DOM
    setPozycja(otwarte && kotwica.current ? przesuniecie(kotwica.current) : null)
  }, [otwarte, kotwica])

  useEffect(() => {
    if (!otwarte) return
    function naZewnatrz(e: MouseEvent) {
      const cel = e.target as Node
      if (panel.current?.contains(cel) || kotwica.current?.contains(cel)) return
      onZamknij()
    }
    document.addEventListener('mousedown', naZewnatrz)
    return () => document.removeEventListener('mousedown', naZewnatrz)
  }, [otwarte, kotwica, onZamknij])

  if (!otwarte || !pozycja) return null

  return createPortal(
    <div
      ref={panel}
      className="wyskakujace-menu"
      style={{ position: 'fixed', top: pozycja.top, left: pozycja.left, transform: 'translateX(-100%)' }}
    >
      {children}
    </div>,
    document.body,
  )
}

/** Menu „⋮" z akcjami wiersza - edycja, zatwierdzenie, usunięcie. */
function MenuKropek({ children }: { children: ReactNode }) {
  const [otwarte, setOtwarte] = useState(false)
  const przycisk = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={przycisk}
        type="button"
        className="menu-akcji-przycisk"
        aria-label="Akcje"
        aria-haspopup="menu"
        aria-expanded={otwarte}
        onClick={() => setOtwarte((o) => !o)}
      >
        ⋮
      </button>
      <Wyskakujace otwarte={otwarte} kotwica={przycisk} onZamknij={() => setOtwarte(false)}>
        <div className="menu-akcji-lista" role="menu" onClick={() => setOtwarte(false)}>
          {children}
        </div>
      </Wyskakujace>
    </>
  )
}

type ZalacznikiIkonaProps = {
  zalaczniki: Zalacznik[]
  mojeId: string
  jestemRodzicem: boolean
  onWgraj: (plik: File) => void
  onUsun: (zalacznik: Zalacznik) => void
  onOtworz: (zalacznik: Zalacznik) => void
}

/** Załączniki jako jedna ikona spinacza z licznikiem - lista rozwija się po kliknięciu. */
function ZalacznikiIkona({ zalaczniki, mojeId, jestemRodzicem, onWgraj, onUsun, onOtworz }: ZalacznikiIkonaProps) {
  const [otwarte, setOtwarte] = useState(false)
  const przycisk = useRef<HTMLButtonElement>(null)
  const wejscie = useRef<HTMLInputElement>(null)

  function wybranoPliki(e: ChangeEvent<HTMLInputElement>) {
    const pliki = e.target.files
    if (!pliki) return
    for (const plik of Array.from(pliki)) onWgraj(plik)
    e.target.value = ''
  }

  return (
    <>
      <button
        ref={przycisk}
        type="button"
        className="zalaczniki-przycisk"
        aria-label={`Załączniki (${zalaczniki.length})`}
        aria-haspopup="dialog"
        aria-expanded={otwarte}
        onClick={() => setOtwarte((o) => !o)}
      >
        📎
        {zalaczniki.length > 0 && <span className="zalaczniki-licznik">{zalaczniki.length}</span>}
      </button>
      <Wyskakujace otwarte={otwarte} kotwica={przycisk} onZamknij={() => setOtwarte(false)}>
        <div className="zalaczniki-lista">
          {zalaczniki.length === 0 && <p className="pusto-male">Brak załączników.</p>}
          {zalaczniki.map((z) => (
            <div key={z.id} className="zalacznik-terminu">
              <button type="button" className="drobny" onClick={() => onOtworz(z)}>
                {z.nazwaPliku}
              </button>
              {(jestemRodzicem || z.autorId === mojeId) && (
                <button
                  type="button"
                  className="usun"
                  aria-label={`Usuń załącznik ${z.nazwaPliku}`}
                  onClick={() => onUsun(z)}
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <button type="button" className="drobny" onClick={() => wejscie.current?.click()}>
            + Dodaj
          </button>
          <input
            ref={wejscie}
            type="file"
            accept={DOZWOLONE_TYPY_ZALACZNIKA.join(',')}
            multiple
            hidden
            onChange={wybranoPliki}
          />
        </div>
      </Wyskakujace>
    </>
  )
}

type WierszTerminuProps = {
  termin: Termin
  dzisiaj: string
  przeterminowany: boolean
  powiadomienieMinelo: boolean
  mogeUsunacTermin: boolean
  mojeId: string
  jestemRodzicem: boolean
  onEdytuj: () => void
  onPrzelacz: () => void
  onUsunTermin: () => void
  onWgrajZalacznik: (plik: File) => void
  onUsunZalacznik: (zalacznik: Zalacznik) => void
  onOtworzZalacznik: (zalacznik: Zalacznik) => void
}

/**
 * Ten sam termin co `WierszTerminu`, tylko złożony w pionie - wariant telefonowy.
 *
 * Tytuł jest akapitem, nie nagłówkiem: to pozycja listy, a nie sekcja dokumentu,
 * a ekran „Terminy" nie ma żadnego <h2>, więc nagłówek karty przeskakiwałby
 * poziom. Kolejność celowo inna niż w tabeli: najpierw tytuł i status, potem
 * data - bo to ona odpowiada na pytanie „czy zdążę".
 */
function KartaTerminu({
  termin,
  dzisiaj,
  przeterminowany,
  powiadomienieMinelo,
  mogeUsunacTermin,
  mojeId,
  jestemRodzicem,
  onEdytuj,
  onPrzelacz,
  onUsunTermin,
  onWgrajZalacznik,
  onUsunZalacznik,
  onOtworzZalacznik,
}: WierszTerminuProps) {
  const status = termin.zalatwiony ? 'zalatwiony' : przeterminowany ? 'przeterminowany' : 'aktywny'
  const statusEtykieta = termin.zalatwiony ? 'Załatwiony' : przeterminowany ? 'Przeterminowany' : 'Aktywny'

  return (
    <li
      className={`karta karta-terminu${termin.zalatwiony ? ' zalatwiony' : ''}${powiadomienieMinelo ? ' powiadomienie-minelo' : ''}`}
    >
      <div className="karta-terminu-gora">
        <p className="tytul-terminu">{termin.tytul}</p>
        <span className={`status-terminu status-${status}`}>{statusEtykieta}</span>
      </div>

      {termin.opis && <p className="opis-terminu">{termin.opis}</p>}

      <div className="karta-terminu-dol">
        <span className="data-terminu">
          {formatujTermin(termin.termin)}
          {przeterminowany && (
            <span className="dni-po-terminie">{dniPoTerminie(termin.termin, dzisiaj)} dni po terminie</span>
          )}
        </span>

        <ZalacznikiIkona
          zalaczniki={termin.zalaczniki}
          mojeId={mojeId}
          jestemRodzicem={jestemRodzicem}
          onWgraj={onWgrajZalacznik}
          onUsun={onUsunZalacznik}
          onOtworz={onOtworzZalacznik}
        />

        <MenuKropek>
          <button type="button" className="menu-akcji-pozycja" onClick={onEdytuj}>
            Edytuj
          </button>
          <button type="button" className="menu-akcji-pozycja" onClick={onPrzelacz}>
            {termin.zalatwiony ? 'Cofnij zatwierdzenie' : 'Zatwierdź'}
          </button>
          {mogeUsunacTermin && (
            <button type="button" className="menu-akcji-pozycja menu-akcji-niebezpieczna" onClick={onUsunTermin}>
              Usuń
            </button>
          )}
        </MenuKropek>
      </div>
    </li>
  )
}

function WierszTerminu({
  termin,
  dzisiaj,
  przeterminowany,
  powiadomienieMinelo,
  mogeUsunacTermin,
  mojeId,
  jestemRodzicem,
  onEdytuj,
  onPrzelacz,
  onUsunTermin,
  onWgrajZalacznik,
  onUsunZalacznik,
  onOtworzZalacznik,
}: WierszTerminuProps) {
  const status = termin.zalatwiony ? 'zalatwiony' : przeterminowany ? 'przeterminowany' : 'aktywny'
  const statusEtykieta = termin.zalatwiony ? 'Załatwiony' : przeterminowany ? 'Przeterminowany' : 'Aktywny'

  return (
    <tr
      className={`wiersz-terminu${termin.zalatwiony ? ' zalatwiony' : ''}${powiadomienieMinelo ? ' powiadomienie-minelo' : ''}`}
    >
      <td className="tytul-terminu">{termin.tytul}</td>

      <td className="opis-terminu">{termin.opis ?? '—'}</td>

      <td>
        <div className="data-terminu">
          {formatujTermin(termin.termin)}
          {przeterminowany && (
            <span className="dni-po-terminie">{dniPoTerminie(termin.termin, dzisiaj)} dni po terminie</span>
          )}
        </div>
      </td>

      <td>
        <ZalacznikiIkona
          zalaczniki={termin.zalaczniki}
          mojeId={mojeId}
          jestemRodzicem={jestemRodzicem}
          onWgraj={onWgrajZalacznik}
          onUsun={onUsunZalacznik}
          onOtworz={onOtworzZalacznik}
        />
      </td>

      <td>
        <span className={`status-terminu status-${status}`}>{statusEtykieta}</span>
      </td>

      <td>
        <MenuKropek>
          <button type="button" className="menu-akcji-pozycja" onClick={onEdytuj}>
            Edytuj
          </button>
          <button type="button" className="menu-akcji-pozycja" onClick={onPrzelacz}>
            {termin.zalatwiony ? 'Cofnij zatwierdzenie' : 'Zatwierdź'}
          </button>
          {mogeUsunacTermin && (
            <button type="button" className="menu-akcji-pozycja menu-akcji-niebezpieczna" onClick={onUsunTermin}>
              Usuń
            </button>
          )}
        </MenuKropek>
      </td>
    </tr>
  )
}

type FormularzTerminuProps = {
  /** Gdy podany, formularz jest w trybie edycji - wypełniony obecnymi wartościami. */
  edytowanyTermin?: Termin
  onZapisz: (wartosci: WartosciFormularza) => Promise<boolean>
  onZapisano?: () => void
}

/** Pole terminu - jeden komponent dla dodawania i edycji. */
function FormularzTerminu({ edytowanyTermin, onZapisz, onZapisano }: FormularzTerminuProps) {
  const edycja = edytowanyTermin !== undefined
  const idPrefix = edytowanyTermin?.id ?? 'nowy'
  const [tytul, setTytul] = useState(edytowanyTermin?.tytul ?? '')
  const [opis, setOpis] = useState(edytowanyTermin?.opis ?? '')
  const [data, setData] = useState(edytowanyTermin?.termin ?? '')
  const [powiadom, setPowiadom] = useState(edytowanyTermin?.powiadom ?? '')
  const [zapisywanie, setZapisywanie] = useState(false)
  const pole = useRef<HTMLInputElement>(null)

  async function wyslij(e: FormEvent) {
    e.preventDefault()
    if (!tytul.trim() || !data) return

    setZapisywanie(true)
    const udalo = await onZapisz({ tytul: tytul.trim(), opis: opis.trim(), data, powiadom: powiadom || null })
    setZapisywanie(false)

    if (udalo) {
      if (!edycja) {
        setTytul('')
        setOpis('')
        setData('')
        setPowiadom('')
        pole.current?.focus()
      }
      onZapisano?.()
    }
  }

  return (
    <form className="karta formularz-terminu" onSubmit={(e) => void wyslij(e)}>
      <label htmlFor={`tytul-terminu-${idPrefix}`}>Tytuł</label>
      <input
        id={`tytul-terminu-${idPrefix}`}
        ref={pole}
        value={tytul}
        onChange={(e) => setTytul(e.target.value)}
        placeholder="np. Ubezpieczenie auta"
        maxLength={200}
      />

      <label htmlFor={`opis-terminu-${idPrefix}`}>Opis (opcjonalnie)</label>
      <textarea
        id={`opis-terminu-${idPrefix}`}
        value={opis}
        onChange={(e) => setOpis(e.target.value)}
        placeholder="np. OC i AC w Warcie"
        maxLength={500}
        rows={2}
      />

      <label htmlFor={`data-terminu-${idPrefix}`}>Do kiedy</label>
      <input
        id={`data-terminu-${idPrefix}`}
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
      />

      <label htmlFor={`powiadom-terminu-${idPrefix}`}>Powiadom (opcjonalnie)</label>
      <input
        id={`powiadom-terminu-${idPrefix}`}
        type="date"
        value={powiadom ?? ''}
        onChange={(e) => setPowiadom(e.target.value)}
      />

      <button type="submit" disabled={zapisywanie || !tytul.trim() || !data}>
        {zapisywanie ? 'Zapisuję…' : edycja ? 'Zapisz zmiany' : 'Dodaj termin'}
      </button>
    </form>
  )
}
