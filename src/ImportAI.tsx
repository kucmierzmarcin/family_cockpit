import { useMemo, useState, type ChangeEvent } from 'react'
import { supabase, type DomownikDb } from './lib/supabase'
import type { PozycjaImportu, WystapienieImportu } from './useWydarzenia'

const WSPOLNE = 'Wspólne'
const MAKS_ROZMIAR_PLIKU = 8 * 1024 * 1024

/** Kształt jednej pozycji, jaki zwraca Edge Function `import-ai`. */
type PozycjaAI = {
  tytul: string
  czlonek: string
  opis_wzorca: string
  wystapienia: WystapienieImportu[]
}

/** Pozycja z podglądu, wraz ze stanem edytowanym przez użytkownika. */
type PozycjaWidoku = {
  tytul: string
  opisWzorca: string
  wystapienia: WystapienieImportu[]
  zaznaczona: boolean
  czlonekId: string | null
}

type Props = {
  domownicy: DomownikDb[]
  onZapisz: (pozycje: PozycjaImportu[]) => Promise<string | null>
  onZamknij: () => void
  /** Czy pokazać własny nagłówek - patrz analogiczny prop w FormularzWydarzenia. */
  pokazTytul?: boolean
}

async function plikDoBase64(plik: File): Promise<string> {
  const bufor = await plik.arrayBuffer()
  let binarne = ''
  for (const bajt of new Uint8Array(bufor)) binarne += String.fromCharCode(bajt)
  return btoa(binarne)
}

export function ImportAI({ domownicy, onZapisz, onZamknij, pokazTytul = true }: Props) {
  const [prompt, setPrompt] = useState('')
  const [plik, setPlik] = useState<File | null>(null)
  const [rozpoznawanie, setRozpoznawanie] = useState(false)
  const [bladRozpoznania, setBladRozpoznania] = useState<string | null>(null)
  const [wynik, setWynik] = useState<PozycjaWidoku[] | null>(null)
  const [zapisywanie, setZapisywanie] = useState(false)
  const [bladZapisu, setBladZapisu] = useState<string | null>(null)

  const idPoImieniu = useMemo(() => new Map(domownicy.map((d) => [d.name, d.id])), [domownicy])

  function zmienPlik(e: ChangeEvent<HTMLInputElement>) {
    const wybrany = e.target.files?.[0] ?? null
    if (wybrany && wybrany.size > MAKS_ROZMIAR_PLIKU) {
      setBladRozpoznania('Plik jest za duży (maks. 8 MB).')
      setPlik(null)
      return
    }
    setBladRozpoznania(null)
    setPlik(wybrany)
  }

  async function rozpoznaj() {
    if (!prompt.trim() && !plik) return
    setRozpoznawanie(true)
    setBladRozpoznania(null)

    const cialo: { prompt?: string; plik?: { dane_base64: string; typ_mime: string } } = {}
    if (prompt.trim()) cialo.prompt = prompt.trim()
    if (plik) cialo.plik = { dane_base64: await plikDoBase64(plik), typ_mime: plik.type }

    const { data, error } = await supabase.functions.invoke<{ pozycje: PozycjaAI[] }>('import-ai', {
      body: cialo,
    })

    setRozpoznawanie(false)
    if (error || !data) {
      setBladRozpoznania(`Nie udało się rozpoznać treści: ${error?.message ?? 'brak odpowiedzi'}`)
      return
    }

    setWynik(
      data.pozycje.map((p) => ({
        tytul: p.tytul,
        opisWzorca: p.opis_wzorca,
        wystapienia: p.wystapienia,
        zaznaczona: true,
        czlonekId: p.czlonek === WSPOLNE ? null : (idPoImieniu.get(p.czlonek) ?? null),
      })),
    )
  }

  function przelaczZaznaczenie(i: number) {
    setWynik((stare) => stare!.map((p, idx) => (idx === i ? { ...p, zaznaczona: !p.zaznaczona } : p)))
  }

  function zmienOsobe(i: number, czlonekId: string) {
    setWynik((stare) => stare!.map((p, idx) => (idx === i ? { ...p, czlonekId: czlonekId || null } : p)))
  }

  async function zapisz() {
    if (!wynik) return
    const zaznaczone = wynik.filter((p) => p.zaznaczona)
    if (zaznaczone.length === 0) return

    setZapisywanie(true)
    setBladZapisu(null)
    const problem = await onZapisz(
      zaznaczone.map((p) => ({ tytul: p.tytul, czlonekId: p.czlonekId, wystapienia: p.wystapienia })),
    )
    setZapisywanie(false)
    if (problem) setBladZapisu(problem)
    else onZamknij()
  }

  return (
    <div className="formularz formularz-import-ai">
      {pokazTytul && <h2 className="panel-tytul">Importuj z AI</h2>}

      {!wynik ? (
        <>
          {bladRozpoznania && (
            <p className="blad" role="alert">
              {bladRozpoznania}
            </p>
          )}

          <label htmlFor="import-prompt">Opisz, co dodać</label>
          <textarea
            id="import-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="np. plan lekcji Zuzi: poniedziałek matematyka 8:00-8:45…"
            rows={4}
          />

          <label htmlFor="import-plik">Albo wgraj plik</label>
          <input id="import-plik" type="file" accept="image/*,application/pdf" onChange={zmienPlik} />
          <span className="wskazowka">Zdjęcie albo PDF, maks. 8 MB.</span>

          <button
            type="button"
            onClick={() => void rozpoznaj()}
            disabled={rozpoznawanie || (!prompt.trim() && !plik)}
          >
            {rozpoznawanie ? 'Rozpoznaję…' : 'Rozpoznaj'}
          </button>

          <button type="button" className="drugi" onClick={onZamknij}>
            Zamknij
          </button>
        </>
      ) : (
        <>
          {bladZapisu && (
            <p className="blad" role="alert">
              {bladZapisu}
            </p>
          )}

          {wynik.length === 0 ? (
            <p className="pusto">Nic nie rozpoznano - spróbuj z innym opisem albo plikiem.</p>
          ) : (
            <ul className="podglad-pozycje">
              {wynik.map((p, i) => (
                <li key={i} className="wiersz-pozycji">
                  <label className="przelacznik">
                    <input type="checkbox" checked={p.zaznaczona} onChange={() => przelaczZaznaczenie(i)} />
                    <span className="wiersz-pozycji-opis">
                      <strong>{p.tytul}</strong> - {p.opisWzorca} ({p.wystapienia.length}{' '}
                      {p.wystapienia.length === 1 ? 'termin' : 'terminów'})
                    </span>
                  </label>
                  <select
                    aria-label={`Osoba dla "${p.tytul}"`}
                    value={p.czlonekId ?? ''}
                    onChange={(e) => zmienOsobe(i, e.target.value)}
                  >
                    <option value="">Wspólne</option>
                    {domownicy.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => void zapisz()}
            disabled={zapisywanie || wynik.every((p) => !p.zaznaczona)}
          >
            {zapisywanie ? 'Zapisuję…' : 'Zapisz zaznaczone'}
          </button>

          <button type="button" className="drugi" onClick={() => setWynik(null)}>
            Wróć
          </button>

          <button type="button" className="drugi" onClick={onZamknij}>
            Zamknij
          </button>
        </>
      )}
    </div>
  )
}
