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
