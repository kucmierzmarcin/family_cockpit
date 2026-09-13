import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Student } from 'npm:vulcan-api-js@3.5.4'
import { zbudujVulcanHebe, type WierszPolaczenia } from './vulcanApi.ts'

type WierszUcznia = { id: string; student_data: unknown }

function poczatekTygodnia(d: Date): Date {
  const kopia = new Date(d)
  const dzien = (kopia.getDay() + 6) % 7 // 0 = poniedziałek
  kopia.setDate(kopia.getDate() - dzien)
  kopia.setHours(0, 0, 0, 0)
  return kopia
}

function koniecTygodnia(poczatek: Date): Date {
  const kopia = new Date(poczatek)
  kopia.setDate(kopia.getDate() + 7)
  return kopia
}

/**
 * Synchronizuje jeden dom: dla każdego przypisanego ucznia pobiera plan
 * lekcji, zmiany, sprawdziany, zadania domowe i wiadomości, zapisuje do
 * naszych tabel. Współdzielona przez `vulcan-sync` (cron, wiele domów) i
 * `vulcan-polacz` (pierwsza synchronizacja od razu po rejestracji).
 *
 * Błąd sesji (certyfikat/token nieważny) ustawia
 * `status = 'wymaga_ponownej_rejestracji'` i przerywa - reszta synchronizacji
 * i tak by się nie udała bez ważnych poświadczeń.
 */
export async function synchronizujDom(
  baza: SupabaseClient,
  householdId: string,
): Promise<{ ok: boolean; blad?: string }> {
  const { data: polaczenie, error: bladPolaczenia } = await baza
    .from('vulcan_connections')
    .select('*')
    .eq('household_id', householdId)
    .single()

  if (bladPolaczenia || !polaczenie) {
    return { ok: false, blad: `Brak połączenia z Vulcan: ${bladPolaczenia?.message ?? 'nie znaleziono'}` }
  }

  const { data: uczniowie, error: bladUczniow } = await baza
    .from('vulcan_students')
    .select('id, student_data')
    .eq('household_id', householdId)
    .not('member_id', 'is', null)

  if (bladUczniow) {
    return { ok: false, blad: `Nie udało się wczytać uczniów: ${bladUczniow.message}` }
  }

  let vulcan
  try {
    vulcan = await zbudujVulcanHebe(polaczenie as WierszPolaczenia)
  } catch (e) {
    return { ok: false, blad: `Nie udało się zbudować klienta Vulcan: ${String(e)}` }
  }

  const poczatek = poczatekTygodnia(new Date())
  const koniec = koniecTygodnia(poczatek)

  for (const uczen of (uczniowie ?? []) as WierszUcznia[]) {
    try {
      await vulcan.selectStudent(uczen.student_data as Student)

      const lekcje = await vulcan.getLessons(poczatek, koniec)
      const zmiany = await vulcan.getChangedLessons(poczatek, koniec)

      const wierszeLekcji = lekcje
        .filter((l) => l.date?.date && l.timeSlot?.start && l.timeSlot?.end)
        .map((l) => ({
          student_id: uczen.id,
          household_id: householdId,
          lesson_date: l.date!.date,
          start_time: l.timeSlot!.start,
          end_time: l.timeSlot!.end,
          subject: l.subject?.name ?? l.event ?? '(brak przedmiotu)',
          teacher: l.teacherPrimary?.displayName ?? null,
          room: l.room?.code ?? null,
          changed: false,
          change_note: null,
        }))

      // Zmiany NADPISUJĄ zwykłą lekcję w tym samym slocie (ten sam klucz
      // unikalności student_id+lesson_date+start_time) - upsert w kolejności
      // "najpierw plan, potem zmiany" daje efekt "zmiana wygrywa".
      const wierszeZmian = zmiany
        .filter((z) => z.lessonDate?.date && z.time?.start && z.time?.end)
        .map((z) => ({
          student_id: uczen.id,
          household_id: householdId,
          lesson_date: z.lessonDate!.date,
          start_time: z.time!.start,
          end_time: z.time!.end,
          subject: z.subject?.name ?? z.event ?? '(zmiana planu)',
          teacher: z.teacher?.displayName ?? null,
          room: z.room?.code ?? null,
          changed: true,
          change_note: z.note ?? z.reason ?? z.event ?? null,
        }))

      if (wierszeLekcji.length > 0) {
        await baza.from('vulcan_lessons').upsert(wierszeLekcji, { onConflict: 'student_id,lesson_date,start_time' })
      }
      if (wierszeZmian.length > 0) {
        await baza.from('vulcan_lessons').upsert(wierszeZmian, { onConflict: 'student_id,lesson_date,start_time' })
      }

      const sprawdziany = await vulcan.getExams()
      const wierszeSprawdzianow = sprawdziany
        .filter((e) => e.deadline?.date)
        .map((e) => ({
          student_id: uczen.id,
          household_id: householdId,
          kind: 'sprawdzian' as const,
          due_date: e.deadline!.date,
          subject: e.subject?.name ?? '(brak przedmiotu)',
          description: e.topic ?? null,
          vulcan_key: e.key,
        }))
      if (wierszeSprawdzianow.length > 0) {
        await baza.from('vulcan_assignments').upsert(wierszeSprawdzianow, { onConflict: 'student_id,kind,vulcan_key' })
      }

      const zadania = await vulcan.getHomework()
      const wierszeZadan = (zadania as Array<Record<string, unknown>>)
        .filter((z) => z.deadline)
        .map((z) => ({
          student_id: uczen.id,
          household_id: householdId,
          kind: 'zadanie_domowe' as const,
          due_date: new Date(z.deadline as string | number | Date).toISOString().slice(0, 10),
          subject: (z.subject as { name?: string } | undefined)?.name ?? '(brak przedmiotu)',
          description: (z.content as string | undefined) ?? null,
          vulcan_key: String(z.key),
        }))
      if (wierszeZadan.length > 0) {
        await baza.from('vulcan_assignments').upsert(wierszeZadan, { onConflict: 'student_id,kind,vulcan_key' })
      }

      const skrzynki = await vulcan.getMessageBoxes()
      const wiadomosci: Array<Record<string, unknown>> = []
      for (const skrzynka of skrzynki as Array<Record<string, unknown>>) {
        const klucz = skrzynka.globalKey as string | undefined
        if (!klucz) continue
        const zSkrzynki = await vulcan.getMessages(klucz)
        wiadomosci.push(...(zSkrzynki as Array<Record<string, unknown>>))
      }
      const wierszeWiadomosci = wiadomosci
        .filter((m) => m.globalKey && m.sentDate)
        .map((m) => ({
          student_id: uczen.id,
          household_id: householdId,
          sender: (m.sender as string | undefined) ?? '(nieznany nadawca)',
          subject: (m.subject as string | undefined) ?? '(brak tematu)',
          content: (m.content as string | undefined) ?? '',
          sent_at: new Date(m.sentDate as string | number | Date).toISOString(),
          vulcan_key: m.globalKey as string,
        }))
      if (wierszeWiadomosci.length > 0) {
        await baza.from('vulcan_messages').upsert(wierszeWiadomosci, { onConflict: 'student_id,vulcan_key' })
      }
    } catch (e) {
      const tekst = String(e)
      // Błędy autoryzacji z biblioteki niosą w treści te nazwy klas - nie ma
      // do nich osobnych kodów HTTP do sprawdzenia inaczej.
      const sesjaNiewazna = /Unauthorized|ExpiredToken|InvalidSignature/i.test(tekst)
      if (sesjaNiewazna) {
        await baza
          .from('vulcan_connections')
          .update({ status: 'wymaga_ponownej_rejestracji', last_error: tekst })
          .eq('household_id', householdId)
        return { ok: false, blad: `Sesja Vulcan wygasła: ${tekst}` }
      }
      return { ok: false, blad: `Błąd synchronizacji ucznia ${uczen.id}: ${tekst}` }
    }
  }

  await baza.from('vulcan_connections').update({ last_error: null }).eq('household_id', householdId)
  return { ok: true }
}
