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
  osobaId: string | null
  autorId: string | null
}

/** Dane wpisywane w formularzu przy dodawaniu i edycji. */
export type DaneWydarzenia = {
  tytul: string
  start: Date
  koniec: Date
  calodniowe: boolean
  osobaId: string | null
}

/** Czego dotyczy zmiana wydarzenia należącego do serii. */
export type ZakresZmiany = 'tylko-to' | 'to-i-kolejne'

function zBazy(w: WydarzenieDb): Wydarzenie {
  return {
    id: w.id,
    tytul: w.title,
    start: zTimestampu(w.starts_at),
    koniec: zTimestampu(w.ends_at),
    calodniowe: w.all_day,
    seriaId: w.series_id,
    osobaId: w.member_id,
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
      .select('*')
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
        member_id: dane.osobaId,
        series_id: seriaId,
      }))

      const { error } = await supabase.from('events').insert(wiersze)
      if (error) {
        onBlad(`Nie udało się zapisać wydarzenia: ${error.message}`)
        return false
      }

      await odswiez()
      return true
    },
    [odswiez, onBlad],
  )

  /**
   * Zmienia wydarzenie. Dla serii `to-i-kolejne` przesuwa też wystąpienia
   * późniejsze, zachowując ich własne daty - zmienia się godzina i długość,
   * nie dzień tygodnia.
   */
  const zmien = useCallback(
    async (wydarzenie: Wydarzenie, dane: DaneWydarzenia, zakres: ZakresZmiany) => {
      const wspolne = {
        title: dane.tytul,
        all_day: dane.calodniowe,
        member_id: dane.osobaId,
      }

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
        await odswiez()
        return true
      }

      // Cała reszta serii: przesuwamy o tę samą różnicę, co edytowane wystąpienie,
      // żeby kolejne treningi nie przeskoczyły wszystkie na jedną datę.
      const przesuniecie = dane.start.getTime() - wydarzenie.start.getTime()
      const dlugosc = dane.koniec.getTime() - dane.start.getTime()

      const { data: kolejne, error: bladPobrania } = await supabase
        .from('events')
        .select('*')
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

      await odswiez()
      return true
    },
    [odswiez, onBlad],
  )

  const usun = useCallback(
    async (wydarzenie: Wydarzenie, zakres: ZakresZmiany) => {
      const kopia = wydarzenia

      const zapytanie =
        zakres === 'to-i-kolejne' && wydarzenie.seriaId
          ? supabase
              .from('events')
              .delete()
              .eq('series_id', wydarzenie.seriaId)
              .gte('starts_at', naTimestamp(wydarzenie.start))
          : supabase.from('events').delete().eq('id', wydarzenie.id)

      // Od razu znika z ekranu; przy błędzie wracamy do poprzedniego stanu.
      setWydarzenia((stare) =>
        zakres === 'to-i-kolejne' && wydarzenie.seriaId
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
