import { createClient } from 'jsr:@supabase/supabase-js@2'
import { zbudujPodsumowanie, type DanePodsumowania } from '../_wspolne/podsumowanie.ts'
import { wyslij } from '../_wspolne/resend.ts'

/**
 * Jeden wiersz z `do_wyslania` - odbiorca już zajęty w dzienniku. Nazwa inna
 * niż `Odbiorca` z `podsumowanie.ts`, bo to co innego: tam adresat treści,
 * tu zadanie do wykonania.
 */
type Zajety = {
  log_id: string
  id_domownika: string
  id_domu: string
  adres: string
  imie: string
  dzien: string
}

Deno.serve(async () => {
  const baza = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data, error } = await baza.rpc('do_wyslania')
  if (error) {
    return odpowiedz({ blad: error.message }, 500)
  }

  const odbiorcy = (data ?? []) as Zajety[]
  if (odbiorcy.length === 0) {
    return odpowiedz({ wyslane: 0, bledy: 0 })
  }

  // Trzech domowników pod jednym adresem to jedno zapytanie o dane, nie trzy.
  const podsumowania = new Map<string, DanePodsumowania>()
  const link = Deno.env.get('APP_URL') ?? ''
  let wyslane = 0
  let bledy = 0

  for (const o of odbiorcy) {
    try {
      let dane = podsumowania.get(o.id_domu)
      if (!dane) {
        const wynik = await baza.rpc('podsumowanie_domu', {
          p_dom: o.id_domu,
          p_dzien: o.dzien,
        })
        if (wynik.error) throw new Error(wynik.error.message)
        dane = wynik.data as DanePodsumowania
        podsumowania.set(o.id_domu, dane)
      }

      const mail = zbudujPodsumowanie(
        dane,
        { memberId: o.id_domownika, imie: o.imie, email: o.adres },
        { linkAplikacji: link },
      )

      await wyslij({ do: o.adres, temat: mail.temat, html: mail.html, tekst: mail.tekst })
      const zamkniecie = await baza.rpc('zamknij_wysylke', { p_log: o.log_id })
      if (zamkniecie.error) throw new Error(zamkniecie.error.message)
      wyslane++
    } catch (e) {
      // Porażka jednej osoby nie może zatrzymać reszty domu.
      await baza.rpc('zamknij_wysylke', {
        p_log: o.log_id,
        p_blad: String(e instanceof Error ? e.message : e).slice(0, 500),
      })
      bledy++
    }
  }

  return odpowiedz({ wyslane, bledy })
})

function odpowiedz(tresc: unknown, status = 200): Response {
  return new Response(JSON.stringify(tresc), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
