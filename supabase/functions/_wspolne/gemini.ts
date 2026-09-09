import type { Pozycja, ZapytanieGemini } from './importAI.ts'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Jedyne miejsce z HTTP do Gemini API. Zapytanie zawsze wymusza narzędzie
 * (patrz `budujZapytanie`), więc odpowiedź to zawsze ustrukturyzowany JSON,
 * nigdy wolny tekst do parsowania.
 */
export async function zapytajGemini(zapytanie: ZapytanieGemini, kluczApi: string): Promise<Pozycja[]> {
  const odpowiedz = await fetch(`${GEMINI_URL}/${zapytanie.model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': kluczApi,
    },
    body: JSON.stringify(zapytanie),
  })

  if (!odpowiedz.ok) {
    const tekst = await odpowiedz.text()
    throw new Error(`Gemini API zwróciło ${odpowiedz.status}: ${tekst}`)
  }

  const dane = await odpowiedz.json()
  const kandydat = dane.candidates?.[0]

  if (kandydat?.finishReason === 'MAX_TOKENS') {
    throw new Error('Odpowiedź została ucięta - zawęź zakres albo podziel import.')
  }
  if (kandydat?.finishReason === 'SAFETY') {
    throw new Error('Gemini odmówił rozpoznania tej treści.')
  }

  const blokNarzedzia = (kandydat?.content?.parts ?? []).find(
    (blok: { functionCall?: unknown }) => blok.functionCall,
  )

  if (!blokNarzedzia) {
    throw new Error('Odpowiedź Gemini nie zawiera wywołania narzędzia.')
  }

  return (blokNarzedzia.functionCall.args as { pozycje: Pozycja[] }).pozycje
}
