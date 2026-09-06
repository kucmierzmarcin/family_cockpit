import type { DomownikDb } from '../lib/supabase'
import type { Wydarzenie } from '../useWydarzenia'
import { SiatkaGodzin } from './SiatkaGodzin'

type Props = {
  dzien: Date
  wydarzenia: Wydarzenie[]
  osobaPoId: Map<string, DomownikDb>
  dzisiaj: Date
  onKlikWydarzenie: (w: Wydarzenie) => void
}

/** Jeden dzień: ta sama siatka godzin, tylko jedna kolumna. */
export function Dzien({ dzien, ...reszta }: Props) {
  return <SiatkaGodzin dni={[dzien]} {...reszta} />
}
