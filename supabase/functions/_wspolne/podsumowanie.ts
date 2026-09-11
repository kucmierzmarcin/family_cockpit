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

/** Wydarzenia odbiorcy na wierzchu wzroku - mail idzie do konkretnej osoby. */
function moje(w: WydarzenieDnia, memberId: string): boolean {
  return w.osoby.some((o) => o.id === memberId)
}

function escapuj(tekst: string): string {
  return tekst
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type Sekcja = { tytul: string; linie: { tresc: string; wyroznione: boolean }[] }

function sekcje(dane: DanePodsumowania, memberId: string): Sekcja[] {
  const wynik: Sekcja[] = []

  if (dane.wydarzenia.length) {
    wynik.push({
      tytul: 'DZIŚ W KALENDARZU',
      linie: dane.wydarzenia.map((w) => ({
        tresc: liniaWydarzenia(w),
        wyroznione: moje(w, memberId),
      })),
    })
  }

  if (dane.notatki.length) {
    wynik.push({
      tytul: 'TABLICA',
      linie: dane.notatki.map((n) => ({ tresc: liniaNotatki(n), wyroznione: false })),
    })
  }

  if (dane.listy.length) {
    wynik.push({
      tytul: 'ZAKUPY',
      linie: dane.listy.map((l) => ({ tresc: liniaListy(l), wyroznione: false })),
    })
  }

  return wynik
}

const SPOKOJNY =
  'Spokojny dzień — nic w kalendarzu, nic nowego na tablicy, listy zakupów odhaczone.'
const STOPKA = 'Wyłączysz to w Kokpicie → Mój dom.'

/**
 * Cały mail: temat, wersja tekstowa i HTML. Kolejność wydarzeń przychodzi
 * z bazy (całodniowe pierwsze) - tu jej nie zmieniamy.
 */
export function zbudujPodsumowanie(
  dane: DanePodsumowania,
  odbiorca: Odbiorca,
  opcje: { linkAplikacji?: string; pokazStopke?: boolean } = {},
): Mail {
  const czesci = sekcje(dane, odbiorca.memberId)
  const powitanie = `Dzień dobry, ${odbiorca.imie}!`
  const link = opcje.linkAplikacji?.trim()
  const stopka = opcje.pokazStopke ?? true

  const tekst = [
    powitanie,
    '',
    ...(czesci.length
      ? czesci.flatMap((s) => [
          s.tytul,
          ...s.linie.map((l) => `${l.wyroznione ? '* ' : '  '}${l.tresc}`),
          '',
        ])
      : [SPOKOJNY, '']),
    ...(stopka ? [STOPKA] : []),
    ...(link ? [link] : []),
  ].join('\n')

  const stopkaHtml = stopka
    ? `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af">${escapuj(STOPKA)}${
        link ? ` <a href="${escapuj(link)}" style="color:#7c3aed">Otwórz Kokpit</a>` : ''
      }</p>`
    : link
      ? `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af"><a href="${escapuj(link)}" style="color:#7c3aed">Otwórz Kokpit</a></p>`
      : ''

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;',
    'font-size:15px;line-height:1.5;color:#1f2937;max-width:520px">',
    `<p style="margin:0 0 16px">${escapuj(powitanie)}</p>`,
    ...(czesci.length
      ? czesci.map(
          (s) =>
            `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:#6b7280">${escapuj(s.tytul)}</p>` +
            `<ul style="margin:0 0 18px;padding-left:18px">` +
            s.linie
              .map(
                (l) =>
                  `<li style="margin:0 0 4px${l.wyroznione ? ';font-weight:600' : ''}">${escapuj(l.tresc)}</li>`,
              )
              .join('') +
            '</ul>',
        )
      : [`<p style="margin:0 0 18px">${escapuj(SPOKOJNY)}</p>`]),
    stopkaHtml,
    '</div>',
  ].join('')

  return { temat: temat(dane), tekst, html }
}
