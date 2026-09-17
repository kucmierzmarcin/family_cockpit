import type { Ekran } from './nawigacja'

/**
 * Ikony zakładek - rysowane kreską, w stylu Lucide, 24×24.
 *
 * Wprost w kodzie, a nie z biblioteki: potrzebujemy ośmiu sztuk, a każda
 * zależność od zestawu ikon to kilkadziesiąt kilobajtów i kolejna rzecz do
 * aktualizowania. Kreska bierze `currentColor`, więc stan aktywny zmienia
 * kolor ikony i podpisu jednym `color` na przycisku.
 *
 * Wszystkie są `aria-hidden`: podpis pod ikoną niesie znaczenie, ikona tylko
 * pomaga ją znaleźć wzrokiem. `focusable="false"` ucisza IE-owy relikt, przez
 * który SVG potrafi łapać tabulator.
 */

type Props = { className?: string }

const WSPOLNE = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: 'false' as const,
}

/** „Dziś" - słońce, bo ekran mówi o tym jednym dniu. */
function Slonce({ className }: Props) {
  return (
    <svg {...WSPOLNE} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function Kalendarz({ className }: Props) {
  return (
    <svg {...WSPOLNE} className={className}>
      <path d="M8 2v4M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </svg>
  )
}

function Koszyk({ className }: Props) {
  return (
    <svg {...WSPOLNE} className={className}>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2 2h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57L22 6H5.12" />
    </svg>
  )
}

function Czapka({ className }: Props) {
  return (
    <svg {...WSPOLNE} className={className}>
      <path d="M21.4 10.9a1 1 0 0 0 0-1.83L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </svg>
  )
}

function Karteczka({ className }: Props) {
  return (
    <svg {...WSPOLNE} className={className}>
      <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5-5V5a2 2 0 0 0-2-2z" />
      <path d="M15 21v-4a2 2 0 0 1 2-2h4" />
    </svg>
  )
}

function Budzik({ className }: Props) {
  return (
    <svg {...WSPOLNE} className={className}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2" />
      <path d="M5 3 2 6M22 6l-3-3M6 19l-2 2M18 19l2 2" />
    </svg>
  )
}

function Domek({ className }: Props) {
  return (
    <svg {...WSPOLNE} className={className}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  )
}

/** Zakładka „Więcej" - trzy kropki, bo kryje listę, nie jeden ekran. */
export function Kropki({ className }: Props) {
  return (
    <svg {...WSPOLNE} className={className}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  )
}

const WG_EKRANU: Record<Ekran, (p: Props) => React.ReactElement> = {
  dashboard: Slonce,
  kalendarz: Kalendarz,
  zakupy: Koszyk,
  tablica: Karteczka,
  terminy: Budzik,
  szkola: Czapka,
  dom: Domek,
}

/** Ikona zakładki danego ekranu. */
export function Ikona({ ekran, className }: Props & { ekran: Ekran }) {
  const Rysunek = WG_EKRANU[ekran]
  return <Rysunek className={className} />
}
