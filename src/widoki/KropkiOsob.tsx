import type { DomownikDb } from '../lib/supabase'
import { osobyWydarzenia } from '../osoby'
import { kolor } from '../kolory'

type Props = {
  osobyId: string[]
  osobaPoId: Map<string, DomownikDb>
}

/**
 * Kropki pozostałych uczestników. Pierwsza osoba nie dostaje kropki - jej kolor
 * niesie już tło bloku, więc powtarzanie go byłoby szumem.
 */
export function KropkiOsob({ osobyId, osobaPoId }: Props) {
  const pozostali = osobyWydarzenia(osobyId, osobaPoId).slice(1)
  if (pozostali.length === 0) return null

  return (
    <span className="kropki-osob" title={pozostali.map((o) => o.name).join(', ')}>
      {pozostali.map((o) => (
        <span
          key={o.id}
          className="kropka mala"
          style={{ background: kolor(o.color).kropka }}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}
