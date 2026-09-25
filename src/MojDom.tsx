import { useEffect, useRef, useState } from 'react'
import {
  OPISY_ROL,
  stanKonta,
  type DomownikDb,
  type Rola,
} from './lib/supabase'
import type { NowyDomownik, ZmianaDomownika } from './useDomownicy'
import { PALETA, kolor } from './kolory'
import { Arkusz } from './uklad/Arkusz'
import type { TrybDodawania } from './uklad/nawigacja'
import { bladGodzinySync, MAKS_GODZIN_SYNC, type StatusPolaczenia } from './vulcan'
import { ParowanieInpost, type StatusInpost } from './uklad/ParowanieInpost'
import { Wczytywanie } from './uklad/Wczytywanie'
import { KartaRocznic } from './uklad/KartaRocznic'
import type { Rocznica, TypRocznicy } from './rocznice'
import { KartaOdpadow } from './uklad/KartaOdpadow'
import type { RodzajOdpadow, TerminOdbioru } from './odpady'

const ROLE: Rola[] = ['rodzic', 'domownik', 'dziecko']

/** Od 5:00 do 10:00 co pół godziny - poza tym oknem "poranne" traci sens. */
const GODZINY = Array.from({ length: 11 }, (_, i) => {
  const minuty = 5 * 60 + i * 30
  return `${String(Math.floor(minuty / 60)).padStart(2, '0')}:${minuty % 60 === 0 ? '00' : '30'}`
})

const OPIS_KONTA = {
  polaczone: 'konto połączone',
  czeka: 'czeka na pierwsze logowanie',
  brak: 'bez konta',
} as const

type Props = {
  domownicy: DomownikDb[]
  ladowanie: boolean
  jestemRodzicem: boolean
  mojeId: string
  proponowanyKolor: () => string
  onDodaj: (nowy: NowyDomownik) => Promise<boolean>
  onZmien: (id: string, zmiany: ZmianaDomownika) => Promise<boolean>
  onUsun: (id: string) => void
  onUstawPowiadomienia: (wlaczone: boolean, godzina: string) => Promise<boolean>
  onPolaczTelegram: () => Promise<string | null>
  vulcan: {
    status: StatusPolaczenia | null
    ladowanie: boolean
    polacz: (apContent: string) => Promise<boolean>
    rozlacz: () => Promise<boolean>
    ustawGodzinySync: (godziny: string[]) => Promise<boolean>
    odswiezTeraz: () => Promise<boolean>
    przypiszUcznia: (uczenId: string, memberId: string | null) => Promise<boolean>
  }
  inpost: {
    polaczenie: StatusInpost | null
    onOdswiez: () => void
    onRozlacz: () => Promise<boolean>
  }
  rocznice: {
    lista: Rocznica[]
    ladowanie: boolean
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
  odpady: {
    lista: TerminOdbioru[]
    ladowanie: boolean
    onDodaj: (rodzaj: RodzajOdpadow, data: string) => Promise<boolean>
    onEdytuj: (id: string, rodzaj: RodzajOdpadow, data: string) => Promise<boolean>
    onUsun: (id: string) => Promise<boolean>
  }
  dodawanie: TrybDodawania
}

/** Ekran "Mój dom": kto należy do domu, z jaką rolą i jakim kontem. */
export function MojDom({
  domownicy,
  ladowanie,
  jestemRodzicem,
  mojeId,
  proponowanyKolor,
  onDodaj,
  onZmien,
  onUsun,
  onUstawPowiadomienia,
  onPolaczTelegram,
  vulcan,
  inpost,
  rocznice,
  odpady,
  dodawanie,
}: Props) {
  const [edytowany, setEdytowany] = useState<string | null>(null)

  const formularzOsoby = (
    <FormularzOsoby
      key={domownicy.length} /* po dodaniu zaczynamy od czystego formularza */
      poczatkowe={{ name: '', color: proponowanyKolor(), role: 'domownik', email: '' }}
      etykietaZapisu="Dodaj domownika"
      onZapisz={async (dane) => {
        const ok = await onDodaj(dane)
        if (ok) dodawanie?.onZamknij()
        return ok
      }}
    />
  )

  return (
    <div className="dom">
      <section className="grupa-dom" aria-labelledby="grupa-domownicy-tytul">
        <h3 className="grupa-tytul" id="grupa-domownicy-tytul">
          Domownicy
        </h3>
        <div className="grupa-karty">
          <section className="karta">
            <h2 className="panel-tytul">Domownicy</h2>
            <p className="panel-dzien">
              {jestemRodzicem
                ? 'Jako rodzic możesz dodawać osoby, zmieniać role i przypisywać konta.'
                : 'Listę domowników zmienia rodzic.'}
            </p>

            {ladowanie ? (
              <Wczytywanie wierszy={4} />
            ) : domownicy.length === 0 ? (
              <p className="pusto">Nikogo tu jeszcze nie ma.</p>
            ) : (
              <ul className="lista-osob">
                {domownicy.map((d) =>
                  edytowany === d.id ? (
                    <li key={d.id} className="osoba-edycja">
                      <FormularzOsoby
                        poczatkowe={{
                          name: d.name,
                          color: d.color,
                          role: d.role,
                          email: d.email ?? '',
                        }}
                        etykietaZapisu="Zapisz"
                        onZapisz={async (dane) => {
                          const ok = await onZmien(d.id, dane)
                          if (ok) setEdytowany(null)
                          return ok
                        }}
                        onAnuluj={() => setEdytowany(null)}
                      />
                    </li>
                  ) : (
                    <li key={d.id}>
                      <span
                        className="kropka"
                        style={{ background: kolor(d.color).kropka }}
                        aria-hidden="true"
                      />
                      <span className="nazwa">
                        {d.name}
                        {d.id === mojeId && <span className="to-ja">to Ty</span>}
                        <span className="meta">
                          {OPISY_ROL[d.role]} · {OPIS_KONTA[stanKonta(d)]}
                          {d.email && ` · ${d.email}`}
                        </span>
                      </span>
                      {jestemRodzicem && (
                        <>
                          <button
                            type="button"
                            className="drobny"
                            onClick={() => setEdytowany(d.id)}
                          >
                            Zmień
                          </button>
                          <button
                            type="button"
                            className="usun"
                            onClick={() => onUsun(d.id)}
                            aria-label={`Usuń domownika ${d.name}`}
                            disabled={d.id === mojeId}
                            title={
                              d.id === mojeId ? 'Nie możesz usunąć samego siebie' : undefined
                            }
                          >
                            ×
                          </button>
                        </>
                      )}
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>

          {jestemRodzicem && dodawanie === null && (
            <section className="karta">
              <h2 className="panel-tytul">Dodaj domownika</h2>
              <p className="panel-dzien">
                Osoba bez adresu e-mail nie loguje się, ale ma swój kolor i wydarzenia.
                Żeby dać jej dostęp, załóż konto w panelu Supabase i wpisz tu ten sam adres.
              </p>
              {formularzOsoby}
            </section>
          )}
        </div>
      </section>

      <section className="grupa-dom" aria-labelledby="grupa-integracje-tytul">
        <h3 className="grupa-tytul" id="grupa-integracje-tytul">
          Integracje
        </h3>
        <div className="grupa-karty">
          <BotTelegram
            ja={domownicy.find((d) => d.id === mojeId)}
            onGeneruj={onPolaczTelegram}
          />

          {jestemRodzicem && <PolaczenieVulcan vulcan={vulcan} domownicy={domownicy} />}

          <ParowanieInpost inpost={inpost} />
        </div>
      </section>

      <section className="grupa-dom" aria-labelledby="grupa-ustawienia-tytul">
        <h3 className="grupa-tytul" id="grupa-ustawienia-tytul">
          Ustawienia domu
        </h3>
        <div className="grupa-karty">
          <Powiadomienia
            ja={domownicy.find((d) => d.id === mojeId)}
            onZapisz={onUstawPowiadomienia}
          />

          <KartaRocznic
            rocznice={rocznice.lista}
            ladowanie={rocznice.ladowanie}
            mojeId={mojeId}
            jestemRodzicem={jestemRodzicem}
            onDodaj={rocznice.onDodaj}
            onEdytuj={rocznice.onEdytuj}
            onUsun={rocznice.onUsun}
          />

          <KartaOdpadow
            terminy={odpady.lista}
            ladowanie={odpady.ladowanie}
            mojeId={mojeId}
            jestemRodzicem={jestemRodzicem}
            onDodaj={odpady.onDodaj}
            onEdytuj={odpady.onEdytuj}
            onUsun={odpady.onUsun}
          />
        </div>
      </section>

      {jestemRodzicem && dodawanie !== null && (
        <Arkusz
          otwarty={dodawanie.otwarte}
          tytul="Dodaj domownika"
          onZamknij={dodawanie.onZamknij}
        >
          {formularzOsoby}
        </Arkusz>
      )}
    </div>
  )
}

type DaneOsoby = { name: string; color: string; role: Rola; email: string }

type FormularzProps = {
  poczatkowe: DaneOsoby
  etykietaZapisu: string
  onZapisz: (dane: NowyDomownik) => Promise<boolean>
  onAnuluj?: () => void
}

/** Wspólny formularz dodawania i edycji - te same pola w obu przypadkach. */
function FormularzOsoby({
  poczatkowe,
  etykietaZapisu,
  onZapisz,
  onAnuluj,
}: FormularzProps) {
  const [dane, setDane] = useState(poczatkowe)
  const [zapisywanie, setZapisywanie] = useState(false)

  async function wyslij(e: React.FormEvent) {
    e.preventDefault()
    const imie = dane.name.trim()
    if (!imie) return

    setZapisywanie(true)
    await onZapisz({
      name: imie,
      color: dane.color,
      role: dane.role,
      email: dane.email.trim() || null,
    })
    setZapisywanie(false)
  }

  return (
    <form className="formularz" onSubmit={(e) => void wyslij(e)}>
      <label htmlFor={`imie-${poczatkowe.name}`}>Imię</label>
      <input
        id={`imie-${poczatkowe.name}`}
        value={dane.name}
        onChange={(e) => setDane({ ...dane, name: e.target.value })}
        placeholder="np. Ania"
        maxLength={40}
      />

      <label htmlFor={`rola-${poczatkowe.name}`}>Rola</label>
      <select
        id={`rola-${poczatkowe.name}`}
        value={dane.role}
        onChange={(e) => setDane({ ...dane, role: e.target.value as Rola })}
      >
        {ROLE.map((r) => (
          <option key={r} value={r}>
            {OPISY_ROL[r]}
          </option>
        ))}
      </select>

      <label htmlFor={`email-${poczatkowe.name}`}>Adres konta (opcjonalnie)</label>
      <input
        id={`email-${poczatkowe.name}`}
        type="email"
        value={dane.email}
        onChange={(e) => setDane({ ...dane, email: e.target.value })}
        placeholder="ten sam, co w panelu Supabase"
      />

      <span className="etykieta-koloru" id={`kolor-${poczatkowe.name}`}>
        Kolor
      </span>
      <div className="paleta" role="radiogroup" aria-labelledby={`kolor-${poczatkowe.name}`}>
        {PALETA.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={k.id === dane.color}
            aria-label={k.id}
            className={`kolor${k.id === dane.color ? ' aktywny' : ''}`}
            style={{ background: k.kropka }}
            onClick={() => setDane({ ...dane, color: k.id })}
          />
        ))}
      </div>

      <button type="submit" disabled={zapisywanie || !dane.name.trim()}>
        {zapisywanie ? 'Zapisuję…' : etykietaZapisu}
      </button>

      {onAnuluj && (
        <button type="button" className="drugi" onClick={onAnuluj}>
          Anuluj
        </button>
      )}
    </form>
  )
}

/**
 * Ustawienia porannego maila - wyłącznie własne. Cudzych powiadomień nie
 * ustawia nikt, rodzic też nie: to skrzynka tej osoby.
 */
function Powiadomienia({
  ja,
  onZapisz,
}: {
  ja: DomownikDb | undefined
  onZapisz: (wlaczone: boolean, godzina: string) => Promise<boolean>
}) {
  const [zapisywanie, setZapisywanie] = useState(false)

  if (!ja) return null

  const godzina = ja.digest_at.slice(0, 5)

  async function zapisz(wlaczone: boolean, oGodzinie: string) {
    setZapisywanie(true)
    await onZapisz(wlaczone, oGodzinie)
    setZapisywanie(false)
  }

  return (
    <section className="karta">
      <h2 className="panel-tytul">Powiadomienia</h2>
      <p className="panel-dzien">
        Poranny mail z tym, co dziś czeka dom: kalendarz, świeże ogłoszenia
        z tablicy i to, czego brakuje na listach zakupów.
      </p>

      <div className="powiadomienia">
        <label className="przelacznik">
          <input
            type="checkbox"
            checked={ja.digest_enabled}
            disabled={zapisywanie}
            onChange={(e) => void zapisz(e.target.checked, godzina)}
          />
          Poranne podsumowanie
        </label>

        <label htmlFor="godzina-podsumowania">O godzinie</label>
        <select
          id="godzina-podsumowania"
          value={godzina}
          disabled={zapisywanie || !ja.digest_enabled}
          onChange={(e) => void zapisz(true, e.target.value)}
        >
          {GODZINY.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}

const NAZWA_BOTA = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined

/**
 * Parowanie z botem na Telegramie - kod jednorazowy z apki, wysyłany do bota
 * jako `/start KOD`. Stan "połączono" przychodzi sam przez Realtime
 * (patrz komentarz przy `polaczTelegram` w useDomownicy.ts).
 */
function BotTelegram({
  ja,
  onGeneruj,
}: {
  ja: DomownikDb | undefined
  onGeneruj: () => Promise<string | null>
}) {
  const [kod, setKod] = useState<string | null>(null)
  const [generowanie, setGenerowanie] = useState(false)

  if (!ja) return null

  async function generuj() {
    setGenerowanie(true)
    setKod(await onGeneruj())
    setGenerowanie(false)
  }

  return (
    <section className="karta">
      <h2 className="panel-tytul">Bot na Telegramie</h2>
      <p className="panel-dzien">
        Napisz do bota „co mam dziś" albo „dodaj wizytę u dentysty w piątek o
        15" - zrozumie zwykłe zdanie.
      </p>

      {ja.telegram_chat_id ? (
        <p className="polaczono">✓ Połączono</p>
      ) : kod ? (
        <div className="kod-telegramu">
          <p>
            Otwórz{' '}
            {NAZWA_BOTA ? (
              <a href={`https://t.me/${NAZWA_BOTA}`} target="_blank" rel="noreferrer">
                t.me/{NAZWA_BOTA}
              </a>
            ) : (
              'bota na Telegramie'
            )}{' '}
            i wyślij:
          </p>
          <p className="kod">/start {kod}</p>
          <p className="panel-dzien">Kod ważny 15 minut.</p>
        </div>
      ) : (
        <button
          type="button"
          className="dodaj-wydarzenie-gorne"
          onClick={() => void generuj()}
          disabled={generowanie}
        >
          Połącz z Telegramem
        </button>
      )}
    </section>
  )
}

type PolaczenieVulcanProps = {
  vulcan: Props['vulcan']
  domownicy: DomownikDb[]
}

/**
 * Połączenie z dziennikiem Vulcan - rejestracja przez wklejenie zawartości
 * eduvulcan.pl/api/ap, przypisanie uczniów do domowników, godziny
 * synchronizacji, rozłączenie.
 * Widoczne tylko rodzicowi (patrz warunek w `MojDom`).
 */
function PolaczenieVulcan({ vulcan, domownicy }: PolaczenieVulcanProps) {
  const [apContent, setApContent] = useState('')
  const [laczenie, setLaczenie] = useState(false)
  const [bladFormularza, setBladFormularza] = useState<string | null>(null)
  const [godziny, setGodziny] = useState<string[]>([])
  const [zapisywanieGodzin, setZapisywanieGodzin] = useState(false)
  const [odswiezanie, setOdswiezanie] = useState(false)

  const status = vulcan.status

  // `status` przychodzi na nowo przy KAŻDYM odświeżeniu z Realtime (patrz
  // `useVulcan`), także dla zmian niezwiązanych z godzinami synchronizacji
  // (np. nowa wiadomość). Porównujemy zapamiętaną wartość `godzinySync`, żeby
  // niezwiązany event nie nadpisał niezapisanej edycji rodzica w formularzu.
  const ostatnieGodzinySync = useRef<string | null>(null)

  useEffect(() => {
    if (!status) return
    const aktualne = JSON.stringify(status.godzinySync)
    if (aktualne !== ostatnieGodzinySync.current) {
      ostatnieGodzinySync.current = aktualne
      // oxlint-disable-next-line react/set-state-in-effect -- synchronizacja pozycji startowej formularza z zewnętrznym źródłem (Realtime), tylko gdy wartość faktycznie się zmieniła
      setGodziny(status.godzinySync)
    }
  }, [status])

  async function polacz(e: React.FormEvent) {
    e.preventDefault()
    setBladFormularza(null)
    setLaczenie(true)
    const ok = await vulcan.polacz(apContent.trim())
    setLaczenie(false)
    if (ok) setApContent('')
  }

  async function zapiszGodziny() {
    const blad = bladGodzinySync(godziny)
    if (blad) {
      setBladFormularza(blad)
      return
    }
    setBladFormularza(null)
    setZapisywanieGodzin(true)
    await vulcan.ustawGodzinySync(godziny)
    setZapisywanieGodzin(false)
  }

  if (vulcan.ladowanie) return null

  return (
    <section className="karta">
      <h2 className="panel-tytul">Vulcan (dziennik elektroniczny)</h2>

      {!status?.istnieje ? (
        <>
          <ol className="instrukcja-vulcan">
            <li>
              Zaloguj się na{' '}
              <a href="https://eduvulcan.pl" target="_blank" rel="noreferrer">
                eduvulcan.pl
              </a>{' '}
              (tak jak zwykle).
            </li>
            <li>
              W tej samej, zalogowanej karcie wejdź na{' '}
              <a href="https://eduvulcan.pl/api/ap" target="_blank" rel="noreferrer">
                eduvulcan.pl/api/ap
              </a>
              .
            </li>
            <li>Zaznacz i skopiuj całą zawartość tej strony (Ctrl+A, Ctrl+C).</li>
            <li>Wklej ją poniżej i kliknij „Połącz".</li>
          </ol>
          <form className="formularz formularz-vulcan" onSubmit={(e) => void polacz(e)}>
            <label htmlFor="vulcan-ap-content">Zawartość strony eduvulcan.pl/api/ap</label>
            <textarea
              id="vulcan-ap-content"
              value={apContent}
              onChange={(e) => setApContent(e.target.value)}
              rows={4}
              placeholder="Wklej tutaj..."
            />

            {bladFormularza && (
              <p className="blad" role="alert">
                {bladFormularza}
              </p>
            )}

            <button type="submit" disabled={laczenie || !apContent.trim()}>
              {laczenie ? 'Łączę…' : 'Połącz'}
            </button>
          </form>
        </>
      ) : (
        <>
          {status.status === 'wymaga_ponownej_rejestracji' ? (
            <p className="blad" role="alert">
              Połączenie wygasło ({status.ostatniBlad ?? 'nieznany błąd'}) — rozłącz i połącz ponownie, wklejając nową zawartość eduvulcan.pl/api/ap.
            </p>
          ) : (
            <p className="polaczono">✓ Połączono{status.polaczylImie ? ` przez ${status.polaczylImie}` : ''}</p>
          )}

          {status.uczniowie.length > 0 && (
            <ul className="lista-uczniow-vulcan">
              {status.uczniowie.map((u) => (
                <li key={u.id}>
                  <span className="nazwa">
                    {u.imie} {u.nazwisko}
                    {u.klasa && <span className="meta"> · {u.klasa}</span>}
                  </span>
                  <select
                    aria-label={`Przypisz ${u.imie} ${u.nazwisko} do domownika`}
                    value={u.memberId ?? ''}
                    onChange={(e) => void vulcan.przypiszUcznia(u.id, e.target.value || null)}
                  >
                    <option value="">Nie pokazuj</option>
                    {domownicy.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}

          <div className="godziny-sync">
            <span className="etykieta-koloru">Godziny synchronizacji (maks. {MAKS_GODZIN_SYNC})</span>
            {godziny.length === 0 && (
              <p className="godziny-sync-wylaczone">
                Automatyczna synchronizacja jest wyłączona — dodaj przynajmniej
                jedną godzinę, żeby ją włączyć.
              </p>
            )}
            {godziny.map((g, i) => (
              <div key={i} className="godzina-sync-wiersz">
                <input
                  type="time"
                  value={g}
                  onChange={(e) => setGodziny(godziny.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button type="button" className="usun" onClick={() => setGodziny(godziny.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            {godziny.length < MAKS_GODZIN_SYNC && (
              <button type="button" className="drobny" onClick={() => setGodziny([...godziny, '07:00'])}>
                + Dodaj godzinę
              </button>
            )}
            {bladFormularza && (
              <p className="blad" role="alert">
                {bladFormularza}
              </p>
            )}
            <button type="button" onClick={() => void zapiszGodziny()} disabled={zapisywanieGodzin}>
              {zapisywanieGodzin ? 'Zapisuję…' : 'Zapisz godziny'}
            </button>
          </div>

          <div className="akcje-vulcan">
            <button
              type="button"
              className="drugi"
              disabled={odswiezanie}
              onClick={async () => {
                setOdswiezanie(true)
                await vulcan.odswiezTeraz()
                setOdswiezanie(false)
              }}
            >
              {odswiezanie ? 'Odświeżam…' : 'Odśwież teraz'}
            </button>
            <button type="button" className="usuwanie" onClick={() => void vulcan.rozlacz()}>
              Rozłącz
            </button>
          </div>
        </>
      )}
    </section>
  )
}
