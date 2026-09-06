import { poczatekDnia } from './czas'

/** Notatka na tablicy rodzinnej. */
export type Notatka = {
  id: string
  tresc: string
  przypieta: boolean
  autorId: string | null
  dodano: Date
}

/**
 * Porządek na tablicy: przypięte na górze, a w obu grupach najnowsze pierwsze.
 * Świeża notatka ma trafić w oko, a przypięta ma zostać na wierzchu niezależnie
 * od tego, ile rzeczy dopisano po niej.
 */
export function posortujNotatki<T extends { przypieta: boolean; dodano: Date }>(
  notatki: T[],
): T[] {
  return [...notatki].sort((a, b) => {
    if (a.przypieta !== b.przypieta) return a.przypieta ? -1 : 1
    return b.dodano.getTime() - a.dodano.getTime()
  })
}

/**
 * Kiedy notatka powstała, po ludzku. `teraz` podajemy z zewnątrz, żeby wynik
 * dało się sprawdzić testem, a nie zależał od zegara maszyny.
 */
export function kiedy(dodano: Date, teraz: Date): string {
  const minuty = Math.floor((teraz.getTime() - dodano.getTime()) / 60000)
  if (minuty < 1) return 'przed chwilą'

  const dzisDzien = poczatekDnia(teraz).getTime()
  const dzienNotatki = poczatekDnia(dodano).getTime()
  const dniTemu = Math.round((dzisDzien - dzienNotatki) / 86400000)

  if (dniTemu <= 0) return 'dziś'
  if (dniTemu === 1) return 'wczoraj'
  if (dniTemu < 7) return `${dniTemu} dni temu`

  return `${dodano.getDate()}.${String(dodano.getMonth() + 1).padStart(2, '0')}`
}
