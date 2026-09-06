import { useCallback, useEffect, useState } from 'react'
import { supabase, type WydarzenieDb } from './lib/supabase'
import { naTimestamp, seria, zTimestampu, type Powtarzanie, type Przedzial } from './czas'

/**
 * Wydarzenie w postaci, z którą pracuje reszta aplikacji: daty jako `Date`,
 * nazwy po polsku. Konwersja z formatu bazy siedzi wyłącznie tutaj.
 */
export type Wydarzenie = Przedzial & {
  id: string
  tytul: string
  calodniowe: boolean
  seriaId: string | null
  /** Identyfikatory przypisanych domowników; pusta lista = wydarzenie wspólne. */
  osobyId: string[]
  autorId: string | null
}

/** Dane wpisywane w formularzu przy dodawaniu i edycji. */
export type DaneWydarzenia = {
  tytul: string
  start: Date
  koniec: Date
  calodniowe: boolean
  osobyId: string[]
}

/** Czego dotyczy zmiana wydarzenia należącego do serii. */
export type ZakresZmiany = 'tylko-to' | 'to-i-kolejne'

/** Pobieramy wydarzenie razem z przypisaniami - jednym zapytaniem. */
const KOLUMNY = '*, event_members(member_id)'

function zBazy(w: WydarzenieDb): Wydarzenie {
  return {
    id: w.id,
    tytul: w.title,
    start: zTimestampu(w.starts_at),
    koniec: zTimestampu(w.ends_at),
    calodniowe: w.all_day,
    seriaId: w.series_id,
    osobyId: (w.event_members ?? []).map((p) => p.member_id),
    autorId: w.created_by,
  }
}

/**
 * Wydarzenia z widocznego zakresu dat. Zakres obejmuje wszystko, co się z nim
 * styka - także wydarzenia zaczynające się wcześniej i kończące później.
 */
export function useWydarzenia(od: Date, doKiedy: Date, onBlad: (tekst: string) => void) {
  const [wydarzenia, setWydarzenia] = useState<Wydarzenie[]>([])
  const [ladowanie, setLadowanie] = useState(true)

  // Zakres jako tekst - dzięki temu efekt nie odpala się przy każdym renderze,
  // gdy rodzic tworzy nowe obiekty Date o tej samej wartości.
  const odTekst = naTimestamp(od)
  const doTekst = naTimestamp(doKiedy)

  const pobierz = useCallback(async (): Promise<Wydarzenie[] | null> => {
    // Test nakładania przedziałów: wydarzenie widać, jeśli zaczyna się przed
    // końcem zakresu i kończy po jego początku.
    const { data, error } = await supabase
      .from('events')
      .select(KOLUMNY)
      .lt('starts_at', doTekst)
      .gt('ends_at', odTekst)
      .order('starts_at')

    if (error) {
      onBlad(`Nie udało się wczytać wydarzeń: ${error.message}`)
      return null
    }
    return (data ?? []).map(zBazy)
  }, [odTekst, doTekst, onBlad])

  useEffect(() => {
    let aktualne = true
    // oxlint-disable-next-line react/set-state-in-effect -- pobieranie danych z zewnętrznego API
    setLadowanie(true)

    void (async () => {
      const lista = await pobierz()
      if (!aktualne) return
      if (lista) setWydarzenia(lista)
      setLadowanie(false)
    })()

    return () => {
      aktualne = false
    }
  }, [pobierz])

  const odswiez = useCallback(async () => {
    const lista = await pobierz()
    if (lista) setWydarzenia(lista)
  }, [pobierz])

  /** Zapisuje przypisania osób do wskazanych wydarzeń. */
  const przypisz = useCallback(
    async (idWydarzen: string[], osobyId: string[]): Promise<string | null> => {
      if (osobyId.length === 0) return null

      const wiersze = idWydarzen.flatMap((eventId) =>
        osobyId.map((memberId) => ({ event_id: eventId, member_id: memberId })),
      )

      const { error } = await supabase.from('event_members').insert(wiersze)
      return error ? error.message : null
    },
    [],
  )

  /**
   * Zapisuje wydarzenie. Przy powtarzaniu tworzy od razu wszystkie wystąpienia
   * ze wspólnym `series_id` - dzięki temu każde da się później zmienić osobno.
   */
  const dodaj = useCallback(
    async (dane: DaneWydarzenia, powtarzanie: Powtarzanie, powtarzajDo: Date) => {
      const wystapienia = seria(dane.start, dane.koniec, powtarzanie, powtarzajDo)
      const seriaId = powtarzanie === 'brak' ? null : crypto.randomUUID()

      const wiersze = wystapienia.map((w) => ({
        title: dane.tytul,
        starts_at: naTimestamp(w.start),
        ends_at: naTimestamp(w.koniec),
        all_day: dane.calodniowe,
        series_id: seriaId,
      }))

      const { data, error } = await supabase.from('events').insert(wiersze).select('id')
      if (error || !data) {
        onBlad(`Nie udało się zapisać wydarzenia: ${error?.message ?? 'brak odpowiedzi'}`)
        return false
      }

      const problem = await przypisz(
        data.map((w) => w.id),
        dane.osobyId,
      )
      if (problem) {
        onBlad(`Wydarzenie zapisane, ale nie udało się przypisać osób: ${problem}`)
        await odswiez()
        return false
      }

      await odswiez()
      return true
    },
    [odswiez, onBlad, przypisz],
  )

  /** Podmienia komplet przypisań: najpierw czyścimy, potem wstawiamy nowe. */
  const ustawOsoby = useCallback(
    async (idWydarzen: string[], osobyId: string[]): Promise<string | null> => {
      const { error } = await supabase
        .from('event_members')
        .delete()
        .in('event_id', idWydarzen)

      if (error) return error.message
      return przypisz(idWydarzen, osobyId)
    },
    [przypisz],
  )

  /**
   * Zmienia wydarzenie. Dla serii `to-i-kolejne` przesuwa też wystąpienia
   * późniejsze, zachowując ich własne daty - zmienia się godzina i długość,
   * nie dzień tygodnia.
   */
  const zmien = useCallback(
    async (wydarzenie: Wydarzenie, dane: DaneWydarzenia, zakres: ZakresZmiany) => {
      const wspolne = { title: dane.tytul, all_day: dane.calodniowe }

      if (zakres === 'tylko-to' || !wydarzenie.seriaId) {
        const { error } = await supabase
          .from('events')
          .update({
            ...wspolne,
            starts_at: naTimestamp(dane.start),
            ends_at: naTimestamp(dane.koniec),
          })
          .eq('id', wydarzenie.id)

        if (error) {
          onBlad(`Nie udało się zapisać zmiany: ${error.message}`)
          return false
        }

        const problem = await ustawOsoby([wydarzenie.id], dane.osobyId)
        if (problem) {
          onBlad(`Nie udało się zapisać osób: ${problem}`)
          await odswiez()
          return false
        }

        await odswiez()
        return true
      }

      // Cała reszta serii: przesuwamy o tę samą różnicę, co edytowane wystąpienie,
      // żeby kolejne treningi nie przeskoczyły wszystkie na jedną datę.
      const przesuniecie = dane.start.getTime() - wydarzenie.start.getTime()
      const dlugosc = dane.koniec.getTime() - dane.start.getTime()

      const { data: kolejne, error: bladPobrania } = await supabase
        .from('events')
        .select('id, starts_at')
        .eq('series_id', wydarzenie.seriaId)
        .gte('starts_at', naTimestamp(wydarzenie.start))

      if (bladPobrania) {
        onBlad(`Nie udało się wczytać serii: ${bladPobrania.message}`)
        return false
      }

      for (const wiersz of kolejne ?? []) {
        const nowyStart = new Date(zTimestampu(wiersz.starts_at).getTime() + przesuniecie)
        const { error } = await supabase
          .from('events')
          .update({
            ...wspolne,
            starts_at: naTimestamp(nowyStart),
            ends_at: naTimestamp(new Date(nowyStart.getTime() + dlugosc)),
          })
          .eq('id', wiersz.id)

        if (error) {
          onBlad(`Nie udało się zapisać całej serii: ${error.message}`)
          await odswiez()
          return false
        }
      }

      const problem = await ustawOsoby(
        (kolejne ?? []).map((w) => w.id),
        dane.osobyId,
      )
      if (problem) {
        onBlad(`Nie udało się zapisać osób w serii: ${problem}`)
        await odswiez()
        return false
      }

      await odswiez()
      return true
    },
    [odswiez, onBlad, ustawOsoby],
  )

  const usun = useCallback(
    async (wydarzenie: Wydarzenie, zakres: ZakresZmiany) => {
      const kopia = wydarzenia
      const calaSeria = zakres === 'to-i-kolejne' && wydarzenie.seriaId

      const zapytanie = calaSeria
        ? supabase
            .from('events')
            .delete()
            .eq('series_id', wydarzenie.seriaId)
            .gte('starts_at', naTimestamp(wydarzenie.start))
        : supabase.from('events').delete().eq('id', wydarzenie.id)

      // Od razu znika z ekranu; przy błędzie wracamy do poprzedniego stanu.
      setWydarzenia((stare) =>
        calaSeria
          ? stare.filter((w) => w.seriaId !== wydarzenie.seriaId || w.start < wydarzenie.start)
          : stare.filter((w) => w.id !== wydarzenie.id),
      )

      const { error } = await zapytanie
      if (error) {
        setWydarzenia(kopia)
        onBlad(`Nie udało się usunąć wydarzenia: ${error.message}`)
      }
    },
    [wydarzenia, onBlad],
  )

  return { wydarzenia, ladowanie, dodaj, zmien, usun }
}
