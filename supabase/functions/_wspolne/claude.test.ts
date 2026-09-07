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
})
