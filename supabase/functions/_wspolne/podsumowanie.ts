/**
 * Poranne podsumowanie: z danych domu robi temat, tekst i HTML maila.
 *
 * Ten plik nie importuje NICZEGO - ani z `src/`, ani z Deno. Dzięki temu
 * testuje się zwykłym vitestem i nadaje się do ponownego użycia przez przyszłego
 * bota na komunikatorze, który poczty nie wyśle, a treść musi mieć tę samą.
 */

/** Wydarzenie tak, jak zwraca je `podsumowanie_domu` w bazie. */
export type WydarzenieDnia = {
  id: string
  title: string
  starts_at: string // 'RRRR-MM-DDTGG:MM:SS', bez strefy
  ends_at: string
  all_day: boolean
  osoby: { id: string; name: string }[]
}

export type NotatkaDnia = { id: string; content: string; pinned: boolean; autor: string }
export type ListaDnia = { id: string; name: string; pozostalo: number }

export type DanePodsumowania = {
  dzien: string // 'RRRR-MM-DD'
  wydarzenia: WydarzenieDnia[]
  notatki: NotatkaDnia[]
  listy: ListaDnia[]
}

/** Do kogo piszemy - `memberId` służy wyróżnieniu jego własnych wydarzeń. */
export type Odbiorca = { memberId: string; imie: string; email: string }

export type Mail = { temat: string; html: string; tekst: string }

/** „1 wydarzenie", „3 wydarzenia", „5 wydarzeń" - polska odmiana przez liczbę. */
export function odmienWydarzenia(n: number): string {
  if (n === 1) return '1 wydarzenie'
  const koncowka = n % 10
  const nastka = n % 100 >= 12 && n % 100 <= 14
  return `${n} ${koncowka >= 2 && koncowka <= 4 && !nastka ? 'wydarzenia' : 'wydarzeń'}`
}

/**
 * „Środa, 9 września". Datę czytamy w południe, bo o północy strefa serwera
 * (w Deno to UTC) potrafi cofnąć dzień o jeden.
 */
export function naglowekDnia(dzien: string): string {
  const d = new Date(`${dzien}T12:00:00`)
  const opis = d.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return opis.charAt(0).toUpperCase() + opis.slice(1)
}

export function temat(dane: DanePodsumowania): string {
  const ile = dane.wydarzenia.length
  return `${naglowekDnia(dane.dzien)} — ${ile === 0 ? 'spokojny dzień' : odmienWydarzenia(ile)}`
}

/**
 * Godzina z kolumny `timestamp`, bez zera wiodącego: '08:00:00' -> '8:00'.
 * Bierzemy podciąg zamiast `new Date(...)`, bo wartość nie niesie strefy,
 * a Date doklejałby strefę serwera i przesuwał godziny.
 */
function godzina(ts: string): string {
  const hhmm = ts.slice(11, 16)
  return hhmm.startsWith('0') ? hhmm.slice(1) : hhmm
}

export function liniaWydarzenia(w: WydarzenieDnia): string {
  const czas = w.all_day ? 'Cały dzień ·' : godzina(w.starts_at)
  const osoby = w.osoby.length ? ` — ${w.osoby.map((o) => o.name).join(', ')}` : ''
  return `${czas} ${w.title}${osoby}`
}

export function liniaNotatki(n: NotatkaDnia): string {
  return `${n.content} (${n.pinned ? 'przypięte, ' : ''}${n.autor})`
}

export function liniaListy(l: ListaDnia): string {
  return `${l.name} — ${l.pozostalo} ${l.pozostalo === 1 ? 'rzecz' : 'rzeczy'}`
}
