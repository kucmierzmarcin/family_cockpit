/**
 * Jedyne miejsce w aplikacji, które wie o dostawcy poczty. Zmiana Resenda na
 * cokolwiek innego to zmiana tego pliku i niczego więcej.
 */

export type Wiadomosc = { do: string; temat: string; html: string; tekst: string }

export async function wyslij(w: Wiadomosc): Promise<void> {
  const klucz = Deno.env.get('RESEND_API_KEY')
  const od = Deno.env.get('RESEND_FROM')

  if (!klucz || !od) {
    throw new Error('Brakuje sekretu RESEND_API_KEY albo RESEND_FROM.')
  }

  const odpowiedz = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${klucz}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: od,
      to: [w.do],
      subject: w.temat,
      html: w.html,
      text: w.tekst,
    }),
  })

  if (!odpowiedz.ok) {
    // Treść błędu trafia do `digest_log.error`, więc obcinamy ją do rozsądnej
    // długości - inaczej stron HTML-a z proxy zaśmieciłaby dziennik.
    const tresc = (await odpowiedz.text()).slice(0, 300)
    throw new Error(`Resend ${odpowiedz.status}: ${tresc}`)
  }
}
