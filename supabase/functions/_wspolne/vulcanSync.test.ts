import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { bezDuplikatow } from './vulcanSync.ts'

// Reprodukuje blad z produkcji: "ON CONFLICT DO UPDATE command cannot affect
// row a second time" dla ucznia 1a352d1a-1278-46ce-965e-4193d27d7144 - Vulcan
// zwrocil dwie lekcje w tym samym slocie planu (ten sam dzien i godzina
// startu, np. podzial na grupy jezykowe), a `wierszePlanu` w `synchronizujDom`
// szedl prosto do `.upsert(..., { onConflict: 'student_id,lesson_date,start_time' })`
// bez przejscia przez `bezDuplikatow` - w przeciwienstwie do sprawdzianow,
// zadan, frekwencji i wiadomosci w tym samym pliku, ktore juz go uzywaly.
Deno.test('bezDuplikatow - usuwa lekcje kolidujace na kluczu konfliktu student_id+lesson_date+start_time', () => {
  const studentId = '1a352d1a-1278-46ce-965e-4193d27d7144'
  const wierszePlanu = [
    {
      student_id: studentId,
      lesson_date: '2026-09-22',
      start_time: '08:00:00',
      subject: 'Jezyk angielski (gr. 1)',
    },
    {
      student_id: studentId,
      lesson_date: '2026-09-22',
      start_time: '08:00:00',
      subject: 'Jezyk angielski (gr. 2)',
    },
    {
      student_id: studentId,
      lesson_date: '2026-09-22',
      start_time: '08:50:00',
      subject: 'Matematyka',
    },
  ]

  const wynik = bezDuplikatow(
    wierszePlanu,
    (w) => `${w.student_id}|${w.lesson_date}|${w.start_time}`,
  )

  assertEquals(wynik.length, 2)
  // "Ostatni wygrywa" - zgodnie z dokumentacja `bezDuplikatow`.
  assertEquals(wynik[0].subject, 'Jezyk angielski (gr. 2)')
  assertEquals(wynik[1].subject, 'Matematyka')
})

Deno.test('bezDuplikatow - nie zmienia batcha bez kolidujacych kluczy', () => {
  const wiersze = [
    { student_id: 'a', lesson_date: '2026-09-22', start_time: '08:00:00' },
    { student_id: 'a', lesson_date: '2026-09-22', start_time: '08:50:00' },
    { student_id: 'b', lesson_date: '2026-09-22', start_time: '08:00:00' },
  ]

  const wynik = bezDuplikatow(wiersze, (w) => `${w.student_id}|${w.lesson_date}|${w.start_time}`)

  assertEquals(wynik.length, 3)
})
