import type { Pozycja, ZapytanieClaude } from './importAI.ts'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Jedyne miejsce z HTTP do Anthropic API. Zapytanie zawsze wymusza narzędzie
 * (patrz `budujZapytanie`), więc odpowiedź to zawsze ustrukturyzowany JSON,
 * nigdy wolny tekst do parsowania.
 */
export async function zapytajClaude(zapytanie: ZapytanieClaude, kluczApi: string): Promise<Pozycja[]> {
  const odpowiedz = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': kluczApi,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(zapytanie),
  })

  if (!odpowiedz.ok) {
    const tekst = await odpowiedz.text()
    throw new Error(`Claude API zwróciło ${odpowiedz.status}: ${tekst}`)
  }

  const dane = await odpowiedz.json()
  const blokNarzedzia = (dane.content ?? []).find(
    (blok: { type: string }) => blok.type === 'tool_use',
  )

  if (!blokNarzedzia) {
    throw new Error('Odpowiedź Claude nie zawiera wywołania narzędzia.')
  }

  return (blokNarzedzia.input as { pozycje: Pozycja[] }).pozycje
}
