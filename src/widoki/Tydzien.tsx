import type { DomownikDb } from '../lib/supabase'
import type { Wydarzenie } from '../useWydarzenia'
import { SiatkaGodzin } from './SiatkaGodzin'

type Props = {
  dni: Date[]
  wydarzenia: Wydarzenie[]
  osobaPoId: Map<string, DomownikDb>
  dzisiaj: Date
  onKlikWydarzenie: (w: Wydarzenie) => void
  onKlikDzien: (dzien: Date) => void
  wypelnijOkno?: boolean
}

/** Tydzień: siedem kolumn w siatce godzin. */
export function Tydzien(props: Props) {
  return <SiatkaGodzin {...props} />
}
