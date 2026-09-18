/**
 * Rate-limiting kroku "poproś o SMS" w proxy `/inpost-api` (patrz vite.config.ts).
 * To jedyne miejsce z realnym serwerem w tej ścieżce - sama funkcja brzegowa
 * `inpost-polacz` już nie wysyła SMS-ów, patrz jej komentarz.
 *
 * Sliding window log w pamięci procesu - reset przy restarcie dev-servera,
 * co jest tu akceptowalne (krótkotrwały, lokalny proces jednego domu).
 */
export type LimiterInpost = {
  /** true = wolno wysłać żądanie do InPostu, false = odrzucić bez wysyłki. */
  pozwalaj(tel: string): boolean
}

type OpcjeLimiteraInpost = {
  /** Ile prób na jeden numer w oknie `oknoNaNumerMs`. */
  limitNaNumer?: number
  oknoNaNumerMs?: number
  /** Ile prób łącznie (wszystkie numery razem) w oknie `oknoGlobalneMs`. */
  limitGlobalny?: number
  oknoGlobalneMs?: number
  teraz?: () => number
}

export function utworzLimiterInpost(opcje: OpcjeLimiteraInpost = {}): LimiterInpost {
  const limitNaNumer = opcje.limitNaNumer ?? 3
  const oknoNaNumerMs = opcje.oknoNaNumerMs ?? 10 * 60 * 1000
  const limitGlobalny = opcje.limitGlobalny ?? 15
  const oknoGlobalneMs = opcje.oknoGlobalneMs ?? 60 * 60 * 1000
  const teraz = opcje.teraz ?? (() => Date.now())

  const probyNaNumer = new Map<string, number[]>()
  let probyGlobalne: number[] = []

  function bezStarych(znaczniki: number[], oknoMs: number): number[] {
    const granica = teraz() - oknoMs
    return znaczniki.filter((t) => t > granica)
  }

  return {
    pozwalaj(tel: string): boolean {
      const aktualneGlobalne = bezStarych(probyGlobalne, oknoGlobalneMs)
      const aktualneNaNumer = bezStarych(probyNaNumer.get(tel) ?? [], oknoNaNumerMs)

      if (aktualneNaNumer.length >= limitNaNumer || aktualneGlobalne.length >= limitGlobalny) {
        probyGlobalne = aktualneGlobalne
        probyNaNumer.set(tel, aktualneNaNumer)
        return false
      }

      const teraznow = teraz()
      aktualneGlobalne.push(teraznow)
      aktualneNaNumer.push(teraznow)
      probyGlobalne = aktualneGlobalne
      probyNaNumer.set(tel, aktualneNaNumer)
      return true
    },
  }
}
