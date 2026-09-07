import type { DomownikDb } from '../lib/supabase'
import { kolor } from '../kolory'
import { wyloguj } from '../auth/useSesja'

type Props = { profil: DomownikDb; email: string }

/**
 * Kto jest zalogowany i przycisk wylogowania. Na komputerze to część nagłówka;
 * na telefonie nagłówek znika, więc karta ląduje na górze ekranu „Mój dom" -
 * tam, gdzie i tak szuka się spraw konta.
 */
export function KontoKarta({ profil, email }: Props) {
  return (
    <section className="karta konto-karta">
      <span className="konto-kto">
        <span
          className="kropka"
          style={{ background: kolor(profil.color).kropka }}
          aria-hidden="true"
        />
        {profil.name}
        <span className="meta">{email}</span>
      </span>
      <button type="button" className="drobny" onClick={() => void wyloguj()}>
        Wyloguj
      </button>
    </section>
  )
}
