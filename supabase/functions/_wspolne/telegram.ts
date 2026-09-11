/**
 * Jedyne miejsce w aplikacji, które wie o Telegram Bot API. Zmiana na inny
 * komunikator to zmiana tego pliku i niczego więcej.
 */

const TELEGRAM_URL = 'https://api.telegram.org/bot'

export async function wyslijWiadomosc(chatId: number, tekst: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) {
    throw new Error('Brakuje sekretu TELEGRAM_BOT_TOKEN.')
  }

  let odpowiedz: Response
  try {
    odpowiedz = await fetch(`${TELEGRAM_URL}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: tekst }),
    })
  } catch {
    // Blad sieciowy (np. DNS) potrafi wpisac caly adres - z tokenem w
    // sciezce - w tresc wyjatku fetch. Nie przepuszczamy go dalej, zeby
    // nie trafil do logow Edge Function przez console.error w index.ts.
    throw new Error('Nie udało się połączyć z Telegramem.')
  }

  if (!odpowiedz.ok) {
    const tresc = (await odpowiedz.text()).slice(0, 300)
    throw new Error(`Telegram ${odpowiedz.status}: ${tresc}`)
  }
}
