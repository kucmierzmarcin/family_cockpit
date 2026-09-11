/**
 * Silnik bota: budowa zapytania do Gemini (trzy narzędzia), walidacja jego
 * odpowiedzi, rozpoznawanie "tak"/"nie" i drobna arytmetyka dat. Czyste
 * funkcje - bez importu Deno ani klienta Supabase, żeby dało się je
 * testować zwykłym vitestem, tak jak `importAI.ts`.
 */

import type { WywolanieNarzedzia } from './gemini.ts'

export const WSPOLNE = 'Wspólne'

export type ZakresPodsumowania = 'dzis' | 'jutro'

export type ProponowaneWydarzenie = {
  tytul: string
  czlonek: string // dokladnie jedno z podanych imion domownikow albo WSPOLNE
  data: string     // 'RRRR-MM-DD'
  start: string    // 'GG:MM' - ignorowane, gdy calodniowe === true
  koniec: string   // 'GG:MM' - ignorowane, gdy calodniowe === true
  calodniowe: boolean
}

export type OdpowiedzBota =
  | { rodzaj: 'podsumowanie'; zakres: ZakresPodsumowania }
  | { rodzaj: 'wydarenie'; wydarenie: ProponowaneWydarzenie }
  | { rodzaj: 'tekst'; tresc: string }

export type Potwierdzenie = 'tak' | 'nie' | 'niejasne'

const MODEL = 'gemini-3.6-flash'

const NARZEDZIE_PODSUMOWANIE = 'pokaz_podsumowanie'
const NARZEDZIE_WYDARENIE = 'zaproponuj_wydarenie'
const NARZEDZIE_TEKST = 'odpowiedz_tekstem'

function danaDzien(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function schematNarzedzi(domownicy: string[]) {
  return [
    {
      name: NARZEDZIE_PODSUMOWANIE,
      description: 'Uzytkownik pyta, co go czeka w domu - kalendarz, tablica, zakupy, dzis albo jutro.',
      parameters: {
        type: 'object',
        properties: {
          zakres: { type: 'string', enum: ['dzis', 'jutro'] },
        },
        required: ['zakres'],
      },
    },
    {
      name: NARZEDZIE_WYDARENIE,
      description: 'Uzytkownik prosi o dodanie pojedynczego wydarenia do kalendarza.',
      parameters: {
        type: 'object',
        properties: {
          tytul: { type: 'string' },
          czlonek: { type: 'string', enum: [...domownicy, WSPOLNE] },
          data: { type: 'string', description: 'RRRR-MM-DD' },
          start: { type: 'string', description: 'GG:MM, dowolne przy calodniowe=true' },
          koniec: { type: 'string', description: 'GG:MM, dowolne przy calodniowe=true' },
          calodniowe: { type: 'boolean' },
        },
        required: ['tytul', 'czlonek', 'data', 'start', 'koniec', 'calodniowe'],
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

/** Zapytanie do Gemini generateContent z trzema narzedziami do wyboru. */
export function budujZapytanieBota(dzisiaj: Date, domownicy: string[], wiadomosc: string) {
  return {
    model: MODEL,
    systemInstruction: {
      parts: [
        {
          text:
            `Jesteś botem rodzinnego kalendarza Kokpit. Dzisiaj jest ${danaDzien(dzisiaj)}. ` +
            `Domownicy w tym domu: ${domownicy.length > 0 ? domownicy.join(', ') : '(brak)'}. ` +
            'Użyj narzędzia pasującego do wiadomości: pokaz_podsumowanie gdy pytają o kalendarz/tablicę/zakupy, ' +
            'zaproponuj_wydarenie gdy proszą o dodanie czegoś do kalendarza (pole "czlonek" musi być dokładnie ' +
            'jednym z podanych imion domowników albo "Wspólne"), odpowiedz_tekstem w każdym innym przypadku - ' +
            'krótko i po ludzku wytłumacz, że potrafisz pokazać kalendarz albo dodać wydarenie.',
        },
      ],
    },
    contents: [{ role: 'user', parts: [{ text: wiadomosc }] }],
    tools: [{ functionDeclarations: schematNarzedzi(domownicy) }],
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
    const zakres = a.zakres
    if (zakres !== 'dzis' && zakres !== 'jutro') {
      throw new Error(`Nieprawidłowy zakres podsumowania: "${String(zakres)}".`)
    }
    return { rodzaj: 'podsumowanie', zakres }
  }

  if (wywolanie.nazwa === NARZEDZIE_WYDARENIE) {
    const dozwoleni = new Set([...domownicy, WSPOLNE])
    if (typeof a.czlonek !== 'string' || !dozwoleni.has(a.czlonek)) {
      throw new Error(`Rozpoznano nieznaną osobę: "${String(a.czlonek)}".`)
    }
    if (typeof a.data !== 'string' || Number.isNaN(new Date(a.data).getTime())) {
      throw new Error(`Nieprawidłowa data: "${String(a.data)}".`)
    }
    if (typeof a.tytul !== 'string' || !a.tytul.trim()) {
      throw new Error('Brak tytułu wydarenia.')
    }
    const calodniowe = Boolean(a.calodniowe)
    const start = typeof a.start === 'string' ? a.start : '00:00'
    const koniec = typeof a.koniec === 'string' ? a.koniec : '23:59'
    if (!calodniowe && koniec <= start) {
      throw new Error('Koniec wydarenia nie jest późniejszy niż początek.')
    }
    return {
      rodzaj: 'wydarenie',
      wydarenie: { tytul: a.tytul, czlonek: a.czlonek, data: a.data, start, koniec, calodniowe },
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

/** Data (RRRR-MM-DD) dla "dzis"/"jutro" wzgledem podanej chwili. */
export function dataDlaZakresu(zakres: ZakresPodsumowania, dzisiaj: Date): string {
  const d = new Date(dzisiaj)
  if (zakres === 'jutro') d.setDate(d.getDate() + 1)
  return danaDzien(d)
}

/** Dzien po danej dacie (RRRR-MM-DD) - potrzebne do konca wydarenia calodniowego. */
export function nastepnyDzien(data: string): string {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Sklada "RRRR-MM-DDTGG:MM:SS" z osobnych pol - tak zapisuje je baza. */
export function zlozTimestamp(data: string, godzina: string): string {
  return `${data}T${godzina}:00`
}

/** Tekst pytania "zapisac: ...?" pokazywany domownikowi przed zapisem. */
export function opisPropozycji(w: ProponowaneWydarzenie): string {
  const kiedy = w.calodniowe ? `${w.data} (cały dzień)` : `${w.data}, ${w.start}–${w.koniec}`
  const dla = w.czlonek === WSPOLNE ? '' : ` (${w.czlonek})`
  return `${w.tytul}${dla} — ${kiedy}`
}
