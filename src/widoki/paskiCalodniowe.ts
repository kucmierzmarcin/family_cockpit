import { nachodzi, wJednymDniu, type Przedzial } from '../czas'

/**
 * Wydarzenia calodniowe/wielodniowe, ktore faktycznie naleza do paska "caly
 * dzien" nad siatka godzin - czyli te, ktore SA calodniowe/wielodniowe ORAZ
 * zachodza na widoczny zakres dni. Wydzielone z SiatkaGodzin.tsx, zeby dalo
 * sie to przetestowac zwyklym vitestem (komponent sam w sobie nie ma testow
 * - ten projekt nie ma @testing-library/jsdom) - patrz zakresGodzin.ts po
 * ten sam wzorzec. Bez filtra zakresu, zrodlo wydarzen spiewajace wiele lat
 * (jak wydarzeniaRocznic()) zalewaloby KAZDY widok dnia/tygodnia wszystkimi
 * swoimi wystapieniami, niezaleznie od tego, czy naleza do widocznego okresu.
 */
export function paskiCalodniowe<T extends Przedzial & { calodniowe: boolean }>(
  wydarzenia: T[],
  odZakresu: Date,
  doZakresu: Date,
): T[] {
  return wydarzenia.filter(
    (w) => (w.calodniowe || !wJednymDniu(w)) && nachodzi(w, odZakresu, doZakresu),
  )
}
