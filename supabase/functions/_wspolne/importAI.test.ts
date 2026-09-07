import { describe, expect, it } from 'vitest'
import { MAKS_WYSTAPIEN_LACZNIE, WSPOLNE, budujZapytanie, waliduj } from './importAI'
import type { Pozycja } from './importAI'

describe('budujZapytanie', () => {
  it('wymusza enum imion domowników plus "Wspólne" w schemacie narzędzia', () => {
    const zapytanie = budujZapytanie(new Date('2026-09-07'), ['Zuzia', 'Ola'], { prompt: 'test' })
    const deklaracja = zapytanie.tools[0].function_declarations[0] as {
      parameters: { properties: { pozycje: { items: { properties: { czlonek: { enum: string[] } } } } } }
    }
    expect(deklaracja.parameters.properties.pozycje.items.properties.czlonek.enum).toEqual([
      'Zuzia',
      'Ola',
      WSPOLNE,
    ])
  })

  it('wpisuje dzisiejszą datę do promptu systemowego', () => {
    const zapytanie = budujZapytanie(new Date('2026-09-07'), [], { prompt: 'test' })
    expect(zapytanie.system_instruction.parts[0].text).toContain('2026-09-07')
  })

  it('dokłada blok pliku przed tekstem, gdy plik jest zdjęciem', () => {
    const zapytanie = budujZapytanie(new Date('2026-09-07'), [], {
      plik: { dane_base64: 'AAAA', typ_mime: 'image/png' },
    })
    expect(zapytanie.contents[0].parts[0]).toEqual({
      inline_data: { mime_type: 'image/png', data: 'AAAA' },
    })
  })

  it('plik PDF trafia tym samym blokiem inline_data co obraz', () => {
    const zapytanie = budujZapytanie(new Date('2026-09-07'), [], {
      plik: { dane_base64: 'AAAA', typ_mime: 'application/pdf' },
    })
    expect(zapytanie.contents[0].parts[0]).toEqual({
      inline_data: { mime_type: 'application/pdf', data: 'AAAA' },
    })
  })

  it('sam prompt, bez pliku, to jeden blok tekstu', () => {
    const zapytanie = budujZapytanie(new Date('2026-09-07'), [], { prompt: 'plan lekcji Zuzi' })
    expect(zapytanie.contents[0].parts).toEqual([{ text: 'plan lekcji Zuzi' }])
  })

  it('wymusza narzędzie przez tool_config', () => {
    const zapytanie = budujZapytanie(new Date('2026-09-07'), [], { prompt: 'test' })
    expect(zapytanie.tool_config).toEqual({
      function_calling_config: { mode: 'ANY', allowed_function_names: ['zwroc_pozycje'] },
    })
  })

  it('ogranicza maxOutputTokens i wyłącza myślenie', () => {
    const zapytanie = budujZapytanie(new Date('2026-09-07'), [], { prompt: 'test' })
    expect(zapytanie.generationConfig).toEqual({
      maxOutputTokens: 16000,
      thinkingConfig: { thinkingBudget: 0 },
    })
  })
})

describe('waliduj', () => {
  const dzisiaj = new Date('2026-09-07')
  const domownicy = ['Zuzia']

  function pozycja(nadpisz: Partial<Pozycja> = {}): Pozycja {
    return {
      tytul: 'Matematyka',
      czlonek: 'Zuzia',
      opis_wzorca: 'poniedziałki',
      wystapienia: [{ data: '2026-09-08', start: '08:00', koniec: '08:45', calodniowe: false }],
      ...nadpisz,
    }
  }

  it('akceptuje poprawną pozycję', () => {
    expect(waliduj([pozycja()], domownicy, dzisiaj)).toBeNull()
  })

  it('odrzuca nieznaną osobę', () => {
    expect(waliduj([pozycja({ czlonek: 'Ktoś obcy' })], domownicy, dzisiaj)).not.toBeNull()
  })

  it('akceptuje "Wspólne"', () => {
    expect(waliduj([pozycja({ czlonek: WSPOLNE })], domownicy, dzisiaj)).toBeNull()
  })

  it('odrzuca pozycję bez wystąpień', () => {
    expect(waliduj([pozycja({ wystapienia: [] })], domownicy, dzisiaj)).not.toBeNull()
  })

  it('odrzuca termin dalszy niż 12 miesięcy', () => {
    const zaDaleko = pozycja({
      wystapienia: [{ data: '2028-01-01', start: '08:00', koniec: '08:45', calodniowe: false }],
    })
    expect(waliduj([zaDaleko], domownicy, dzisiaj)).not.toBeNull()
  })

  it(`odrzuca więcej niż ${MAKS_WYSTAPIEN_LACZNIE} wystąpień łącznie`, () => {
    const duzo = pozycja({
      wystapienia: Array.from({ length: MAKS_WYSTAPIEN_LACZNIE + 1 }, () => ({
        data: '2026-09-08',
        start: '08:00',
        koniec: '08:45',
        calodniowe: false,
      })),
    })
    expect(waliduj([duzo], domownicy, dzisiaj)).not.toBeNull()
  })

  it('odrzuca wystąpienie, w którym koniec nie jest późniejszy niż początek', () => {
    const zle = pozycja({
      wystapienia: [{ data: '2026-09-08', start: '09:00', koniec: '08:00', calodniowe: false }],
    })
    expect(waliduj([zle], domownicy, dzisiaj)).not.toBeNull()
  })

  it('nie sprawdza godzin przy wydarzeniu całodniowym', () => {
    const calodniowe = pozycja({
      wystapienia: [{ data: '2026-09-08', start: '00:00', koniec: '00:00', calodniowe: true }],
    })
    expect(waliduj([calodniowe], domownicy, dzisiaj)).toBeNull()
  })

  it('odrzuca nieprawidłową datę w wystąpieniu', () => {
    const zlaData = pozycja({
      wystapienia: [{ data: 'nie-data', start: '08:00', koniec: '08:45', calodniowe: false }],
    })
    expect(waliduj([zlaData], domownicy, dzisiaj)).not.toBeNull()
  })

  it('odrzuca termin z przeszłości', () => {
    const zPrzeszlosci = pozycja({
      wystapienia: [{ data: '2020-01-01', start: '08:00', koniec: '08:45', calodniowe: false }],
    })
    expect(waliduj([zPrzeszlosci], domownicy, dzisiaj)).not.toBeNull()
  })

  it('akceptuje termin datowany na dzisiaj', () => {
    const naDzis = pozycja({
      wystapienia: [{ data: '2026-09-07', start: '08:00', koniec: '08:45', calodniowe: false }],
    })
    expect(waliduj([naDzis], domownicy, dzisiaj)).toBeNull()
  })

  it(`akceptuje dokładnie ${MAKS_WYSTAPIEN_LACZNIE} wystąpień łącznie`, () => {
    const dokladnieLimit = pozycja({
      wystapienia: Array.from({ length: MAKS_WYSTAPIEN_LACZNIE }, () => ({
        data: '2026-09-08',
        start: '08:00',
        koniec: '08:45',
        calodniowe: false,
      })),
    })
    expect(waliduj([dokladnieLimit], domownicy, dzisiaj)).toBeNull()
  })

  it('akceptuje termin ok. 11 miesięcy od dzisiaj (wewnątrz horyzontu)', () => {
    const jedenascieMiesiecy = new Date(dzisiaj)
    jedenascieMiesiecy.setMonth(jedenascieMiesiecy.getMonth() + 11)
    const blisko = pozycja({
      wystapienia: [
        {
          data: jedenascieMiesiecy.toISOString().slice(0, 10),
          start: '08:00',
          koniec: '08:45',
          calodniowe: false,
        },
      ],
    })
    expect(waliduj([blisko], domownicy, dzisiaj)).toBeNull()
  })
})
