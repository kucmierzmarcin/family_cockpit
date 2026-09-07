import { afterEach, describe, expect, it, vi } from 'vitest'
import { zapytajClaude } from './claude'
import type { ZapytanieClaude } from './importAI'

const ZAPYTANIE: ZapytanieClaude = {
  model: 'claude-sonnet-5',
  max_tokens: 100,
  system: 'test',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
  tools: [],
  tool_choice: { type: 'tool', name: 'zwroc_pozycje' },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('zapytajClaude', () => {
  it('zwraca pozycje z bloku tool_use', async () => {
    const pozycje = [{ tytul: 'Test', czlonek: 'Wspólne', opis_wzorca: '', wystapienia: [] }]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: 'tool_use', input: { pozycje } }] }),
      }),
    )

    await expect(zapytajClaude(ZAPYTANIE, 'klucz')).resolves.toEqual(pozycje)

    expect(fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'klucz', 'anthropic-version': '2023-06-01' }),
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

    await expect(zapytajClaude(ZAPYTANIE, 'zly-klucz')).rejects.toThrow('401')
  })

  it('rzuca błędem, gdy odpowiedź nie zawiera wywołania narzędzia', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'przepraszam, nie rozumiem' }] }),
      }),
    )

    await expect(zapytajClaude(ZAPYTANIE, 'klucz')).rejects.toThrow('narzędzia')
  })

  it('rzuca błędem, gdy odpowiedź została ucięta (max_tokens), nawet z blokiem tool_use', async () => {
    const pozycje = [{ tytul: 'Test', czlonek: 'Wspólne', opis_wzorca: '', wystapienia: [] }]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stop_reason: 'max_tokens',
          content: [{ type: 'tool_use', input: { pozycje } }],
        }),
      }),
    )

    await expect(zapytajClaude(ZAPYTANIE, 'klucz')).rejects.toThrow('ucięta')
  })

  it('rzuca błędem, gdy Claude odmówił (stop_reason "refusal")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ stop_reason: 'refusal', content: [] }),
      }),
    )

    await expect(zapytajClaude(ZAPYTANIE, 'klucz')).rejects.toThrow('odmówił')
  })
})
