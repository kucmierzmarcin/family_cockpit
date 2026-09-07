import { afterEach, describe, expect, it, vi } from 'vitest'
import { zapytajGemini } from './gemini'
import type { ZapytanieGemini } from './importAI'

const ZAPYTANIE: ZapytanieGemini = {
  model: 'gemini-2.5-flash',
  system_instruction: { parts: [{ text: 'test' }] },
  contents: [{ role: 'user', parts: [{ text: 'test' }] }],
  tools: [{ function_declarations: [] }],
  tool_config: { function_calling_config: { mode: 'ANY', allowed_function_names: ['zwroc_pozycje'] } },
  generationConfig: { maxOutputTokens: 100, thinkingConfig: { thinkingBudget: 0 } },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('zapytajGemini', () => {
  it('zwraca pozycje z functionCall', async () => {
    const pozycje = [{ tytul: 'Test', czlonek: 'Wspólne', opis_wzorca: '', wystapienia: [] }]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ functionCall: { name: 'zwroc_pozycje', args: { pozycje } } }] },
              finishReason: 'STOP',
            },
          ],
        }),
      }),
    )

    await expect(zapytajGemini(ZAPYTANIE, 'klucz')).resolves.toEqual(pozycje)

    expect(fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goog-api-key': 'klucz' }),
        body: JSON.stringify(ZAPYTANIE),
      }),
    )
  })

  it('rzuca błędem, gdy API odpowie błędem HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'invalid api key',
      }),
    )

    await expect(zapytajGemini(ZAPYTANIE, 'zly-klucz')).rejects.toThrow('401')
  })

  it('rzuca błędem, gdy odpowiedź nie zawiera wywołania narzędzia', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'przepraszam, nie rozumiem' }] }, finishReason: 'STOP' }],
        }),
      }),
    )

    await expect(zapytajGemini(ZAPYTANIE, 'klucz')).rejects.toThrow('narzędzia')
  })

  it('rzuca błędem, gdy odpowiedź została ucięta (MAX_TOKENS), nawet z functionCall', async () => {
    const pozycje = [{ tytul: 'Test', czlonek: 'Wspólne', opis_wzorca: '', wystapienia: [] }]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ functionCall: { name: 'zwroc_pozycje', args: { pozycje } } }] },
              finishReason: 'MAX_TOKENS',
            },
          ],
        }),
      }),
    )

    await expect(zapytajGemini(ZAPYTANIE, 'klucz')).rejects.toThrow('ucięta')
  })

  it('rzuca błędem, gdy Gemini odmówił (finishReason "SAFETY")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] }),
      }),
    )

    await expect(zapytajGemini(ZAPYTANIE, 'klucz')).rejects.toThrow('odmówił')
  })
})
