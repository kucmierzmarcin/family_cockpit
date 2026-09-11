import { useState } from 'react'
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
      <section className="karta">
        <h2 className="panel-tytul">Domownicy</h2>
        <p className="panel-dzien">
          {jestemRodzicem
            ? 'Jako rodzic możesz dodawać osoby, zmieniać role i przypisywać konta.'
            : 'Listę domowników zmienia rodzic.'}
        </p>

        {ladowanie ? (
          <p className="pusto">Wczytuję…</p>
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

      <Powiadomienia
        ja={domownicy.find((d) => d.id === mojeId)}
        onZapisz={onUstawPowiadomienia}
      />

      <BotTelegram
        ja={domownicy.find((d) => d.id === mojeId)}
        onGeneruj={onPolaczTelegram}
      />

      {jestemRodzicem &&
        (dodawanie === null ? (
          <section className="karta">
            <h2 className="panel-tytul">Dodaj domownika</h2>
            <p className="panel-dzien">
              Osoba bez adresu e-mail nie loguje się, ale ma swój kolor i wydarzenia.
              Żeby dać jej dostęp, załóż konto w panelu Supabase i wpisz tu ten sam adres.
            </p>
            {formularzOsoby}
          </section>
        ) : (
          <Arkusz
            otwarty={dodawanie.otwarte}
            tytul="Dodaj domownika"
            onZamknij={dodawanie.onZamknij}
          >
            {formularzOsoby}
          </Arkusz>
        ))}
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
