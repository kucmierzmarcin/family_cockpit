/**
 * Silnik bota: budowa zapytania do Gemini (trzy narzędzia), walidacja jego
 * odpowiedzi, rozpoznawanie "tak"/"nie" i drobna arytmetyka dat. Czyste
 * funkcje - bez importu Deno ani klienta Supabase, żeby dało się je
 * testować zwykłym vitestem, tak jak `importAI.ts`.
 */

import type { WywolanieNarzedzia } from './gemini.ts'
import { naglowekDnia } from './podsumowanie.ts'

export const WSPOLNE = 'Wspólne'

/** Ten sam zestaw opcji co formularz wydarzenia w aplikacji (src/czas.ts). */
export type Powtarzanie = 'brak' | 'tydzien' | 'dwa-tygodnie' | 'miesiac'

export type ProponowaneWydarzenie = {
  tytul: string
  czlonkowie: string[] // >=1 z podanych imion domownikow albo [WSPOLNE]
  data: string     // 'RRRR-MM-DD'
  start: string    // 'GG:MM' - ignorowane, gdy calodniowe === true
  koniec: string   // 'GG:MM' - ignorowane, gdy calodniowe === true
  calodniowe: boolean
  powtarzanie: Powtarzanie
  powtarzajDo: string | null // 'RRRR-MM-DD' - wymagane, gdy powtarzanie !== 'brak'
}

export type ProponowanaPozycjaZakupow = {
  nazwa: string
  ilosc: string | null
  lista: string | null // null = uzytkownik nie nazwal listy, kod sam decyduje
}

export type ProponowanaNotatka = {
  tresc: string
  przypieta: boolean
}

/** Wydarzenie tak, jak zwraca je znajdz_wydarzenia_bota() z bazy. */
export type WydarzenieZnalezione = {
  title: string
  starts_at: string // 'RRRR-MM-DDTGG:MM:SS'
  ends_at: string
  all_day: boolean
}

export type OdpowiedzBota =
  | { rodzaj: 'podsumowanie'; data: string }
  | { rodzaj: 'wydarzenie'; wydarzenie: ProponowaneWydarzenie }
  | { rodzaj: 'usun_wydarzenie'; opis: string; dzien: string | null }
  | { rodzaj: 'zakupy'; pozycja: ProponowanaPozycjaZakupow }
  | { rodzaj: 'notatka'; notatka: ProponowanaNotatka }
  | { rodzaj: 'tekst'; tresc: string }

export type Potwierdzenie = 'tak' | 'nie' | 'niejasne'

const MODEL = 'gemini-3.6-flash'

const NARZEDZIE_PODSUMOWANIE = 'pokaz_podsumowanie'
const NARZEDZIE_WYDARZENIE = 'zaproponuj_wydarzenie'
const NARZEDZIE_USUN = 'usun_wydarzenie'
const NARZEDZIE_ZAKUPY = 'dodaj_pozycje_zakupow'
const NARZEDZIE_NOTATKA = 'dodaj_notatke'
const NARZEDZIE_TEKST = 'odpowiedz_tekstem'

function danaDzien(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function schematNarzedzi(domownicy: string[], listyZakupow: string[]) {
  return [
    {
      name: NARZEDZIE_PODSUMOWANIE,
      description:
        'Uzytkownik pyta, co go czeka w domu - kalendarz, tablica, zakupy - na dowolny dzien: dzis, jutro, ' +
        'konkretny dzien tygodnia albo konkretna data.',
      parameters: {
        type: 'object',
        properties: {
          data: {
            type: 'string',
            description:
              'RRRR-MM-DD - dokladna data dnia, o ktory pyta uzytkownik, policzona wzgledem dzisiejszej daty.',
          },
        },
        required: ['data'],
      },
    },
    {
      name: NARZEDZIE_WYDARZENIE,
      description: 'Uzytkownik prosi o dodanie pojedynczego wydarzenia do kalendarza.',
      parameters: {
        type: 'object',
        properties: {
          tytul: { type: 'string' },
          czlonkowie: {
            type: 'array',
            items: { type: 'string', enum: [...domownicy, WSPOLNE] },
            description:
              'Lista osob, ktorych dotyczy wydarzenie - dokladnie imiona z listy domownikow albo "Wspólne". ' +
              'Moze byc kilka osob naraz, np. ["Zuzia", "Oliwier"].',
          },
          data: { type: 'string', description: 'RRRR-MM-DD' },
          start: { type: 'string', description: 'GG:MM, dowolne przy calodniowe=true' },
          koniec: { type: 'string', description: 'GG:MM, dowolne przy calodniowe=true' },
          calodniowe: { type: 'boolean' },
          powtarzanie: {
            type: 'string',
            enum: ['brak', 'tydzien', 'dwa-tygodnie', 'miesiac'],
            description: 'Czy wydarzenie sie powtarza. "brak", gdy jednorazowe (pomin pole, jesli nie podano).',
          },
          powtarzaj_do: {
            type: 'string',
            description: 'RRRR-MM-DD - do kiedy powtarzac. Wymagane tylko, gdy powtarzanie != "brak".',
          },
        },
        required: ['tytul', 'czlonkowie', 'data', 'start', 'koniec', 'calodniowe'],
      },
    },
    {
      name: NARZEDZIE_USUN,
      description: 'Uzytkownik prosi o usuniecie istniejacego wydarzenia z kalendarza.',
      parameters: {
        type: 'object',
        properties: {
          opis: { type: 'string', description: 'Fragment tytulu wydarzenia do usuniecia, np. "dentysta".' },
          data: {
            type: 'string',
            description: 'RRRR-MM-DD, jesli uzytkownik podal dzien wydarzenia. Pomin, jesli nie podal.',
          },
        },
        required: ['opis'],
      },
    },
    {
      name: NARZEDZIE_ZAKUPY,
      description: 'Uzytkownik prosi o dodanie pozycji na liste zakupow.',
      parameters: {
        type: 'object',
        properties: {
          nazwa: { type: 'string', description: 'Nazwa produktu, np. "Mleko".' },
          ilosc: { type: 'string', description: 'Opcjonalnie ilosc, np. "1 l", "2 szt.". Pomin, jesli nie podano.' },
          lista: {
            type: 'string',
            ...(listyZakupow.length > 0 ? { enum: listyZakupow } : {}),
            description:
              listyZakupow.length > 0
                ? 'Nazwa listy, jesli uzytkownik ja podal - dokladnie jedna z istniejacych list.'
                : 'Nazwa listy, jesli uzytkownik ja podal (w tym domu nie ma jeszcze zadnej listy).',
          },
        },
        required: ['nazwa'],
      },
    },
    {
      name: NARZEDZIE_NOTATKA,
      description: 'Uzytkownik prosi o dodanie notatki/ogloszenia na tablice rodzinna.',
      parameters: {
        type: 'object',
        properties: {
          tresc: {
            type: 'string',
            description:
              'DOKLADNA tresc notatki, ktora ma trafic na tablice - przepisz to, co uzytkownik chce zapisac, ' +
              'usuwajac tylko polecenie ("dodaj notatke", "zapisz na tablicy" itp.). NIE parafrazuj, ' +
              'NIE wymyslaj wlasnej tresci ani szczegolow, ktorych uzytkownik nie podal.',
          },
          przypieta: { type: 'boolean', description: 'Czy notatka ma byc przypieta na gorze tablicy.' },
        },
        required: ['tresc'],
      },
    },
    {
      name: NARZEDZIE_TEKST,
      description: 'Wiadomosc nie pasuje do zadnej z powyzszych akcji - odpowiedz krotko, po ludzku.',
      parameters: {
        type: 'object',
        properties: {
          tresc: { type: 'string' },
        },
        required: ['tresc'],
      },
    },
  ]
}

/** Zapytanie do Gemini generateContent z szescioma narzedziami do wyboru. */
export function budujZapytanieBota(
  dzisiaj: Date,
  domownicy: string[],
  listyZakupow: string[],
  wiadomosc: string,
) {
  return {
    model: MODEL,
    systemInstruction: {
      parts: [
        {
          text:
            `Jesteś botem rodzinnego kalendarza Kokpit. Dzisiaj jest ${danaDzien(dzisiaj)}. ` +
            `Domownicy w tym domu: ${domownicy.length > 0 ? domownicy.join(', ') : '(brak)'}. ` +
            `Listy zakupów w tym domu: ${listyZakupow.length > 0 ? listyZakupow.join(', ') : '(brak)'}. ` +
            'Użyj narzędzia pasującego do wiadomości: pokaz_podsumowanie gdy pytają o kalendarz/tablicę/zakupy na ' +
            'dowolny dzień (pole "data" musi być policzoną datą RRRR-MM-DD, nie nazwą dnia), ' +
            'zaproponuj_wydarzenie gdy proszą o dodanie czegoś do kalendarza (pole "czlonkowie" to lista - jedno ' +
            'imię, kilka imion albo "Wspólne", dokładnie z podanych imion domowników; pole "powtarzanie" tylko, gdy mówią że coś się ' +
            'powtarza - np. "co tydzień", "co miesiąc" - wraz z "powtarzaj_do" jako datą końca powtarzania), ' +
            'usun_wydarzenie gdy proszą o usunięcie/skasowanie ' +
            'istniejącego wydarzenia, dodaj_pozycje_zakupow gdy proszą o dopisanie ' +
            'czegoś na listę zakupów, dodaj_notatke gdy proszą o dopisanie notatki/ogłoszenia na tablicę, ' +
            'odpowiedz_tekstem w każdym innym przypadku - ' +
            'NIE odpowiadaj na pytanie, nawet jeśli znasz odpowiedź (np. wiedza ogólna, pogawędka) - zamiast tego ' +
            'krótko i po ludzku wytłumacz, że jesteś botem kalendarza i potrafisz tylko pokazać kalendarz, dodać ' +
            'wydarzenie, dopisać coś na listę zakupów albo notatkę na tablicę. ' +
            'We wszystkich polach tekstowych (tytuł, nazwa pozycji, treść notatki) przepisuj DOKŁADNIE to, co ' +
            'napisał użytkownik - nigdy nie wymyślaj ani nie parafrazuj treści, których nie podał.',
        },
      ],
    },
    contents: [{ role: 'user', parts: [{ text: wiadomosc }] }],
    tools: [{ functionDeclarations: schematNarzedzi(domownicy, listyZakupow) }],
    toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    generationConfig: { maxOutputTokens: 2000, thinkingConfig: { thinkingLevel: 'minimal' } },
  }
}

/**
 * Waliduje wywolanie narzedzia od Gemini - to dane z granicy zaufania,
 * sprawdzamy je tak samo jak dane od uzytkownika. Rzuca czytelny blad
 * zamiast zwracac null, bo kazdy blad tutaj i tak konczy sie tym samym
 * komunikatem "cos poszlo nie tak" w index.ts.
 */
export function rozpoznajOdpowiedz(
  wywolanie: WywolanieNarzedzia,
  domownicy: string[],
): OdpowiedzBota {
  const a = wywolanie.args

  if (wywolanie.nazwa === NARZEDZIE_PODSUMOWANIE) {
    if (typeof a.data !== 'string' || Number.isNaN(new Date(a.data).getTime())) {
      throw new Error(`Nieprawidłowa data: "${String(a.data)}".`)
    }
    return { rodzaj: 'podsumowanie', data: a.data }
  }

  if (wywolanie.nazwa === NARZEDZIE_WYDARZENIE) {
    const dozwoleni = new Set([...domownicy, WSPOLNE])
    // Gemini czasem zwraca pojedynczy string zamiast tablicy jednoelementowej -
    // akceptujemy to jako wygode, zamiast odrzucac cala odpowiedz.
    const czlonkowieRaw = Array.isArray(a.czlonkowie)
      ? a.czlonkowie
      : typeof a.czlonkowie === 'string'
        ? [a.czlonkowie]
        : []
    if (
      czlonkowieRaw.length === 0 ||
      !czlonkowieRaw.every((c: unknown): c is string => typeof c === 'string' && dozwoleni.has(c))
    ) {
      throw new Error(`Rozpoznano nieznaną osobę: "${String(a.czlonkowie)}".`)
    }
    const czlonkowie = czlonkowieRaw as string[]
    if (typeof a.data !== 'string' || Number.isNaN(new Date(a.data).getTime())) {
      throw new Error(`Nieprawidłowa data: "${String(a.data)}".`)
    }
    if (typeof a.tytul !== 'string' || !a.tytul.trim()) {
      throw new Error('Brak tytułu wydarzenia.')
    }
    const calodniowe = Boolean(a.calodniowe)
    const start = typeof a.start === 'string' ? a.start : '00:00'
    const koniec = typeof a.koniec === 'string' ? a.koniec : '23:59'
    if (!calodniowe && koniec <= start) {
      throw new Error('Koniec wydarzenia nie jest późniejszy niż początek.')
    }

    const powtarzanieRaw = typeof a.powtarzanie === 'string' ? a.powtarzanie : 'brak'
    if (powtarzanieRaw !== 'brak' && powtarzanieRaw !== 'tydzien' && powtarzanieRaw !== 'dwa-tygodnie' && powtarzanieRaw !== 'miesiac') {
      throw new Error(`Nieprawidłowa wartość powtarzania: "${powtarzanieRaw}".`)
    }
    const powtarzanie = powtarzanieRaw as Powtarzanie
    let powtarzajDo: string | null = null
    if (powtarzanie !== 'brak') {
      if (typeof a.powtarzaj_do !== 'string' || !a.powtarzaj_do.trim()) {
        throw new Error('Brak daty końca powtarzania (powtarzaj_do).')
      }
      if (Number.isNaN(new Date(a.powtarzaj_do).getTime())) {
        throw new Error(`Nieprawidłowa data w powtarzaj_do: "${a.powtarzaj_do}".`)
      }
      if (a.powtarzaj_do < a.data) {
        throw new Error('Data w powtarzaj_do jest wcześniejsza niż data wydarzenia.')
      }
      powtarzajDo = a.powtarzaj_do
    }

    return {
      rodzaj: 'wydarzenie',
      wydarzenie: { tytul: a.tytul, czlonkowie, data: a.data, start, koniec, calodniowe, powtarzanie, powtarzajDo },
    }
  }

  if (wywolanie.nazwa === NARZEDZIE_USUN) {
    if (typeof a.opis !== 'string' || !a.opis.trim()) {
      throw new Error('Brak opisu wydarzenia do usunięcia.')
    }
    const dzien = typeof a.data === 'string' && a.data.trim() ? a.data : null
    if (dzien !== null && Number.isNaN(new Date(dzien).getTime())) {
      throw new Error(`Nieprawidłowa data: "${dzien}".`)
    }
    return { rodzaj: 'usun_wydarzenie', opis: a.opis, dzien }
  }

  if (wywolanie.nazwa === NARZEDZIE_ZAKUPY) {
    if (typeof a.nazwa !== 'string' || !a.nazwa.trim()) {
      throw new Error('Brak nazwy pozycji do dodania na zakupy.')
    }
    return {
      rodzaj: 'zakupy',
      pozycja: {
        nazwa: a.nazwa,
        ilosc: typeof a.ilosc === 'string' && a.ilosc.trim() ? a.ilosc : null,
        lista: typeof a.lista === 'string' && a.lista.trim() ? a.lista : null,
      },
    }
  }

  if (wywolanie.nazwa === NARZEDZIE_NOTATKA) {
    if (typeof a.tresc !== 'string' || !a.tresc.trim()) {
      throw new Error('Brak treści notatki.')
    }
    return {
      rodzaj: 'notatka',
      notatka: { tresc: a.tresc, przypieta: Boolean(a.przypieta) },
    }
  }

  if (wywolanie.nazwa === NARZEDZIE_TEKST) {
    const tresc = a.tresc
    return {
      rodzaj: 'tekst',
      tresc: typeof tresc === 'string' && tresc.trim() ? tresc : 'Nie jestem pewien, o co pytasz.',
    }
  }

  throw new Error(`Nieznane narzędzie: "${wywolanie.nazwa}".`)
}

const SLOWA_TAK = new Set(['tak', 'ok', 'okej', 'jasne', 'pewnie', 'zapisz', 'dodaj'])
const SLOWA_NIE = new Set(['nie', 'anuluj', 'odrzuc', 'niewazne'])

/** Rozpoznaje odpowiedz na pytanie "zapisac?" - bez wolania Gemini. */
export function rozpoznajPotwierdzenie(wiadomosc: string): Potwierdzenie {
  const znormalizowana = wiadomosc.trim().toLowerCase()
  if (SLOWA_TAK.has(znormalizowana)) return 'tak'
  if (SLOWA_NIE.has(znormalizowana)) return 'nie'
  return 'niejasne'
}

/**
 * Etykieta sekcji kalendarza w odpowiedzi bota - "DZIS"/"JUTRO" dla tych
 * dwoch szczegolnych dni (zgodnosc z dotychczasowym brzmieniem), pelna nazwa
 * dnia (przez naglowekDnia z podsumowanie.ts) dla kazdego innego.
 */
export function etykietaDnia(data: string, dzisiaj: Date): string {
  const dzis = danaDzien(dzisiaj)
  if (data === dzis) return 'DZIŚ W KALENDARZU'
  if (data === nastepnyDzien(dzis)) return 'JUTRO W KALENDARZU'
  return `${naglowekDnia(data).toUpperCase()} W KALENDARZU`
}

/** Dzien po danej dacie (RRRR-MM-DD) - potrzebne do konca wydarzenia calodniowego. */
export function nastepnyDzien(data: string): string {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Sklada "RRRR-MM-DDTGG:MM:SS" z osobnych pol - tak zapisuje je baza. */
export function zlozTimestamp(data: string, godzina: string): string {
  return `${data}T${godzina}:00`
}

const OPIS_POWTARZANIA: Record<Exclude<Powtarzanie, 'brak'>, string> = {
  tydzien: 'tydzień',
  'dwa-tygodnie': 'dwa tygodnie',
  miesiac: 'miesiąc',
}

/** Tekst pytania "zapisac: ...?" pokazywany domownikowi przed zapisem. */
export function opisPropozycji(w: ProponowaneWydarzenie): string {
  const kiedyData =
    w.powtarzanie === 'brak'
      ? w.data
      : `co ${OPIS_POWTARZANIA[w.powtarzanie]} od ${w.data} do ${w.powtarzajDo}`
  const kiedy = w.calodniowe ? `${kiedyData} (cały dzień)` : `${kiedyData}, ${w.start}–${w.koniec}`
  const dla = w.czlonkowie.includes(WSPOLNE) ? '' : ` (${w.czlonkowie.join(', ')})`
  return `${w.tytul}${dla} — ${kiedy}`
}

/** Opis istniejacego wydarzenia (z bazy) - do listy kandydatow i pytania "usunac: ...?". */
export function opisWydarzenia(w: WydarzenieZnalezione): string {
  const dzien = w.starts_at.slice(0, 10)
  if (w.all_day) return `${w.title} — ${dzien} (cały dzień)`
  const start = w.starts_at.slice(11, 16)
  const koniec = w.ends_at.slice(11, 16)
  return `${w.title} — ${dzien}, ${start}–${koniec}`
}
