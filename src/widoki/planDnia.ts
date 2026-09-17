import type { DomownikDb } from '../lib/supabase'
import type { Wydarzenie } from '../useWydarzenia'

export type PlanOsoby = {
  osoba: DomownikDb
  /** Wydarzenia tej osoby, po godzinie rozpoczęcia. */
  wydarzenia: Wydarzenie[]
}

export type PlanDnia = {
  zajeci: PlanOsoby[]
  wolni: DomownikDb[]
}

/**
 * Dzień domu rozbity na osoby - do listy, którą „Dziś" pokazuje na telefonie
 * zamiast poziomej osi czasu (ta na 390px chowała ponad połowę doby za
 * przewijaniem w bok).
 *
 * Kolejność bierzemy z listy domowników, nie z wydarzeń - ta sama zasada co w
 * `osobyWydarzenia`, dzięki czemu imiona stoją zawsze w tym samym porządku
 * niezależnie od tego, kto akurat ma coś wcześniej.
 *
 * Wspólne wydarzenie pojawia się pod każdym uczestnikiem. Powtórzenie jest
 * celowe: lista odpowiada na pytanie „co ma ta osoba", a nie „ile jest
 * wydarzeń w domu".
 */
export function pogrupujPlanDnia(
  domownicy: DomownikDb[],
  wydarzenia: Wydarzenie[],
): PlanDnia {
  const zajeci: PlanOsoby[] = []
  const wolni: DomownikDb[] = []

  for (const osoba of domownicy) {
    const swoje = wydarzenia
      .filter((w) => w.osobyId.includes(osoba.id))
      .sort((a, b) => a.start.getTime() - b.start.getTime())

    if (swoje.length > 0) zajeci.push({ osoba, wydarzenia: swoje })
    else wolni.push(osoba)
  }

  return { zajeci, wolni }
}
