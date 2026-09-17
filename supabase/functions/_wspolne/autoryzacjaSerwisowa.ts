/**
 * Rozpoznanie wywołania serwisowego (pg_cron, klucz service_role) w
 * odróżnieniu od wywołania z przeglądarki (JWT zwykłego użytkownika).
 *
 * Wspólne dla `inpost-sync` i `vulcan-sync` - obie funkcje mają dokładnie ten
 * sam podział: "zsynchronizuj wszystkie due domy" (cron) kontra
 * "zsynchronizuj MÓJ dom teraz" (przycisk w UI). Przed tą zmianą kod był
 * dosłownie skopiowany do obu `index.ts` bez ani jednego testu - ryzykowne,
 * bo funkcja dekoduje JWT BEZ WERYFIKACJI PODPISU: jedyne, co dzieli
 * podrobiony ładunek `{"role":"service_role"}` od "zsynchronizuj wszystkie
 * domy w całej instalacji", to bramka `verify_jwt` Supabase (patrz
 * `supabase/config.toml`) - podpis musi zostać zweryfikowany PRZED tym, jak
 * ten kod w ogóle wystartuje. Ta funkcja tylko odczytuje już zweryfikowany
 * ładunek, nigdy sama nie weryfikuje podpisu.
 *
 * Ten plik nie importuje NICZEGO - ani z `src/`, ani z Deno - dzięki temu
 * testuje się zwykłym vitestem, tak samo jak `inpostApi.ts`/`podsumowanie.ts`.
 *
 * NIE porównujemy nagłówka ze `SUPABASE_SERVICE_ROLE_KEY` ze środowiska -
 * takie porównanie było wcześniejszym błędem: sekret Vault
 * `kokpit_klucz_serwisowy` (którym `net.http_post` buduje nagłówek) trzyma
 * klucz w formacie legacy JWT, a `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
 * po migracji API keys zwraca nowy format `sb_secret_...`. Dwa różne stringi,
 * porównanie nigdy prawdziwe, każdy tick crona kończył się 401.
 */
export function jestWywolaniemSerwisowym(naglowekAutoryzacji: string): boolean {
  const dopasowanie = naglowekAutoryzacji.match(/^Bearer\s+(.+)$/)
  if (!dopasowanie) return false
  const czesci = dopasowanie[1].trim().split('.')
  if (czesci.length !== 3) return false
  try {
    const base64 = czesci[1].replace(/-/g, '+').replace(/_/g, '/')
    const uzupelnione = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const ladunek = JSON.parse(atob(uzupelnione)) as { role?: unknown }
    return ladunek.role === 'service_role'
  } catch {
    return false
  }
}
