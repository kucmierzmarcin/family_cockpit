/**
 * Budowa zapytania do Gemini i walidacja jego odpowiedzi. Czyste funkcje -
 * bez importu Deno ani klienta Supabase, żeby dało się je testować zwykłym
 * vitestem, tak jak `src/czas.ts` czy `src/notatki.ts`.
 */

export type Wystapienie = {
  data: string // 'RRRR-MM-DD'
  start: string // 'GG:MM' - ignorowane, gdy calodniowe === true
  koniec: string // 'GG:MM' - ignorowane, gdy calodniowe === true
  calodniowe: boolean
}

export type Pozycja = {
  tytul: string
  czlonek: string // dokładnie jedno z podanych imion domowników albo WSPOLNE
  opis_wzorca: string
  wystapienia: Wystapienie[]
}

export type ZapytanieWejscie = {
  prompt?: string
  plik?: { dane_base64: string; typ_mime: string }
}

export type ZapytanieGemini = {
  model: string
  systemInstruction: { parts: { text: string }[] }
  contents: { role: 'user'; parts: Record<string, unknown>[] }[]
  tools: { functionDeclarations: Record<string, unknown>[] }[]
  toolConfig: { functionCallingConfig: { mode: 'ANY'; allowedFunctionNames: string[] } }
  generationConfig: { maxOutputTokens: number; thinkingConfig: { thinkingLevel: string } }
}

export const WSPOLNE = 'Wspólne'
export const MAKS_WYSTAPIEN_LACZNIE = 150
export const MAKS_MIESIECY_HORYZONTU = 12

const NAZWA_NARZEDZIA = 'zwroc_pozycje'
const MODEL = 'gemini-3.6-flash'

function danaDzien(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function schematNarzedzia(domownicy: string[]) {
  return {
    name: NAZWA_NARZEDZIA,
    description:
      'Zwraca listę pozycji kalendarza rozpoznanych z tekstu albo pliku - każda pozycja to jedno ' +
      'powtarzające się albo jednorazowe wydarzenie z konkretnymi wystąpieniami.',
    parameters: {
      type: 'object',
      properties: {
        pozycje: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tytul: { type: 'string' },
              czlonek: { type: 'string', enum: [...domownicy, WSPOLNE] },
              opis_wzorca: {
                type: 'string',
                description:
                  'Krótki, czytelny opis wzorca do pokazania człowiekowi, np. ' +
                  '"poniedziałki 8:00–8:45, do 19 grudnia".',
              },
              wystapienia: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    data: { type: 'string', description: 'RRRR-MM-DD' },
                    start: { type: 'string', description: 'GG:MM, dowolne przy calodniowe=true' },
                    koniec: { type: 'string', description: 'GG:MM, dowolne przy calodniowe=true' },
                    calodniowe: { type: 'boolean' },
                  },
                  required: ['data', 'start', 'koniec', 'calodniowe'],
                },
              },
            },
            required: ['tytul', 'czlonek', 'opis_wzorca', 'wystapienia'],
          },
        },
      },
      required: ['pozycje'],
    },
  }
}

/**
 * Buduje treść zapytania do Gemini generateContent. Czysta funkcja - nie
 * robi żadnego IO. Obraz i PDF trafiają tym samym blokiem `inline_data` -
 * Gemini, w przeciwieństwie do Anthropic, nie rozróżnia ich typem bloku.
 */
export function budujZapytanie(
  dzisiaj: Date,
  domownicy: string[],
  wejscie: ZapytanieWejscie,
): ZapytanieGemini {
  const parts: Record<string, unknown>[] = []

  if (wejscie.plik) {
    parts.push({
      inlineData: { mimeType: wejscie.plik.typ_mime, data: wejscie.plik.dane_base64 },
    })
  }

  parts.push({
    text: wejscie.prompt?.trim() || 'Rozpoznaj wydarzenia kalendarza z załączonego pliku.',
  })

  return {
    model: MODEL,
    systemInstruction: {
      parts: [
        {
          text:
            `Jesteś asystentem kalendarza rodzinnego. Dzisiaj jest ${danaDzien(dzisiaj)}. ` +
            `Domownicy w tym domu: ${domownicy.length > 0 ? domownicy.join(', ') : '(brak - wszystko będzie wspólne)'}. ` +
            'Rozpoznaj z tekstu i/albo pliku listę wydarzeń kalendarza (np. plan lekcji, harmonogram odbioru ' +
            'śmieci, plan zajęć pozalekcyjnych) i zwróć je narzędziem zwroc_pozycje. Zasady: (1) pole "czlonek" ' +
            'musi być dokładnie jednym z podanych imion domowników albo "Wspólne" - nie wolno wpisać innej ' +
            'wartości; (2) jeśli plik/prompt podaje konkretne daty, użyj ich dokładnie; jeśli to wzorzec cykliczny ' +
            'bez podanego końca (np. plan lekcji), przyjmij rozsądny domyślny horyzont, nie dłuższy niż kilka ' +
            'miesięcy; (3) każda pozycja musi mieć co najmniej jedno wystąpienie; (4) jeśli nic sensownego nie da ' +
            'się rozpoznać, zwróć pustą listę pozycji zamiast zgadywać.',
        },
      ],
    },
    contents: [{ role: 'user', parts }],
    tools: [{ functionDeclarations: [schematNarzedzia(domownicy)] }],
    toolConfig: {
      functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [NAZWA_NARZEDZIA] },
    },
    generationConfig: { maxOutputTokens: 16000, thinkingConfig: { thinkingLevel: 'minimal' } },
  }
}

/**
 * Waliduje wynik od modelu - to dane z granicy zaufania, sprawdzamy je tak
 * samo jak dane od użytkownika. Zwraca komunikat błędu czytelny dla
 * użytkownika albo `null`, gdy wszystko w porządku.
 */
export function waliduj(pozycje: Pozycja[], domownicy: string[], dzisiaj: Date): string | null {
  const dozwoleniCzlonkowie = new Set([...domownicy, WSPOLNE])
  const limitHoryzontu = new Date(dzisiaj)
  limitHoryzontu.setMonth(limitHoryzontu.getMonth() + MAKS_MIESIECY_HORYZONTU)
  const dolnyLimit = new Date(dzisiaj)
  dolnyLimit.setDate(dolnyLimit.getDate() - 1)

  let lacznieWystapien = 0

  for (const pozycja of pozycje) {
    if (!dozwoleniCzlonkowie.has(pozycja.czlonek)) {
      return `Rozpoznano nieznaną osobę: "${pozycja.czlonek}".`
    }
    if (pozycja.wystapienia.length === 0) {
      return `Pozycja "${pozycja.tytul}" nie ma żadnego wystąpienia.`
    }
    for (const w of pozycja.wystapienia) {
      const dataDate = new Date(w.data)
      if (Number.isNaN(dataDate.getTime())) {
        return `Pozycja "${pozycja.tytul}" ma nieprawidłową datę: "${w.data}".`
      }
      if (dataDate > limitHoryzontu) {
        return 'Rozpoznano zbyt odległy termin - zawęź zakres albo podziel import.'
      }
      if (dataDate < dolnyLimit) {
        return `Pozycja "${pozycja.tytul}" ma termin z przeszłości: "${w.data}".`
      }
      if (!w.calodniowe && w.koniec <= w.start) {
        return `Pozycja "${pozycja.tytul}" ma wystąpienie, w którym koniec nie jest późniejszy niż początek.`
      }
    }
    lacznieWystapien += pozycja.wystapienia.length
  }

  if (lacznieWystapien > MAKS_WYSTAPIEN_LACZNIE) {
    return 'Rozpoznano zbyt dużo terminów - zawęź zakres albo podziel import.'
  }

  return null
}
