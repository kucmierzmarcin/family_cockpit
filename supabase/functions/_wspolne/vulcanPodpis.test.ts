import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { podpiszZadanie } from './vulcanPodpis.ts'

Deno.test('podpiszZadanie - rzuca dla URL bez segmentu api/mobile', () => {
  assertThrows(
    () => podpiszZadanie('fp', 'klucz', '', 'https://lekcjaplus.vulcan.net.pl/milanowek/inny/segment', 'x'),
    Error,
    'nie pasuje',
  )
})
