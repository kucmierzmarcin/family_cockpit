import { describe, expect, it } from 'vitest'
import {
  liniaListy,
  liniaNotatki,
  liniaWydarzenia,
  naglowekDnia,
  odmienWydarzenia,
  temat,
  zbudujPodsumowanie,
  type DanePodsumowania,
} from './podsumowanie'

function dane(ile: number) {
  return {
    dzien: '2026-09-09',
    wydarzenia: Array.from({ length: ile }, (_, i) => ({
      id: `w${i}`,
      title: `Wydarzenie ${i}`,
      starts_at: '2026-09-09T08:00:00',
      ends_at: '2026-09-09T09:00:00',
      all_day: false,
      osoby: [],
    })),
    notatki: [],
    listy: [],
  }
}

describe('odmienWydarzenia', () => {
  it('liczba pojedyncza', () => {
    expect(odmienWydarzenia(1)).toBe('1 wydarzenie')
  })

  it('dwa do czterech', () => {
    expect(odmienWydarzenia(3)).toBe('3 wydarzenia')
    expect(odmienWydarzenia(22)).toBe('22 wydarzenia')
  })

  it('pięć i więcej', () => {
    expect(odmienWydarzenia(5)).toBe('5 wydarzeń')
    expect(odmienWydarzenia(11)).toBe('11 wydarzeń')
  })

  it('nastki są wyjątkiem, mimo końcówki 2-4', () => {
    expect(odmienWydarzenia(13)).toBe('13 wydarzeń')
  })
})

describe('naglowekDnia', () => {
  it('nazwa dnia z wielkiej litery, potem data', () => {
    expect(naglowekDnia('2026-09-09')).toBe('Środa, 9 września')
  })
})

describe('temat', () => {
  it('liczy wydarzenia', () => {
    expect(temat(dane(3))).toBe('Środa, 9 września — 3 wydarzenia')
  })

  it('pusty dzień nazywa po imieniu', () => {
    expect(temat(dane(0))).toBe('Środa, 9 września — spokojny dzień')
  })
})

describe('liniaWydarzenia', () => {
  it('godzinowe: godzina, tytuł, osoby', () => {
    expect(
      liniaWydarzenia({
        id: 'a',
        title: 'Trening',
        starts_at: '2026-09-09T08:00:00',
        ends_at: '2026-09-09T09:30:00',
        all_day: false,
        osoby: [
          { id: 'o1', name: 'Ola' },
          { id: 'o2', name: 'Marek' },
        ],
      }),
    ).toBe('8:00 Trening — Ola, Marek')
  })

  it('całodniowe zamiast godziny mówi "Cały dzień"', () => {
    expect(
      liniaWydarzenia({
        id: 'b',
        title: 'Wakacje',
        starts_at: '2026-09-09T00:00:00',
        ends_at: '2026-09-12T00:00:00',
        all_day: true,
        osoby: [],
      }),
    ).toBe('Cały dzień · Wakacje')
  })

  it('bez osób nie dokleja myślnika', () => {
    expect(
      liniaWydarzenia({
        id: 'c',
        title: 'Dentysta',
        starts_at: '2026-09-09T14:05:00',
        ends_at: '2026-09-09T15:00:00',
        all_day: false,
        osoby: [],
      }),
    ).toBe('14:05 Dentysta')
  })
})

describe('liniaNotatki', () => {
  it('przypięta jest oznaczona', () => {
    expect(liniaNotatki({ id: 'n', content: 'Zebranie', pinned: true, autor: 'Marek' })).toBe(
      'Zebranie (przypięte, Marek)',
    )
  })

  it('zwykła podaje samego autora', () => {
    expect(liniaNotatki({ id: 'n', content: 'Kupiłem chleb', pinned: false, autor: 'Ola' })).toBe(
      'Kupiłem chleb (Ola)',
    )
  })
})

describe('liniaListy', () => {
  it('jedna rzecz', () => {
    expect(liniaListy({ id: 'l', name: 'Apteka', pozostalo: 1 })).toBe('Apteka — 1 rzecz')
  })

  it('więcej rzeczy', () => {
    expect(liniaListy({ id: 'l', name: 'Spożywcze', pozostalo: 4 })).toBe('Spożywcze — 4 rzeczy')
  })
})

const ODBIORCA = { memberId: 'ja', imie: 'Ola', email: 'ola@dom.pl' }

const PELNE: DanePodsumowania = {
  dzien: '2026-09-09',
  // Kolejność jak z bazy: całodniowe przed godzinowym.
  wydarzenia: [
    {
      id: 'w2',
      title: 'Wakacje',
      starts_at: '2026-09-09T00:00:00',
      ends_at: '2026-09-12T00:00:00',
      all_day: true,
      osoby: [{ id: 'inny', name: 'Kuba' }],
    },
    {
      id: 'w1',
      title: 'Trening',
      starts_at: '2026-09-09T18:00:00',
      ends_at: '2026-09-09T19:00:00',
      all_day: false,
      osoby: [{ id: 'ja', name: 'Ola' }],
    },
  ],
  notatki: [{ id: 'n1', content: 'Zebranie', pinned: true, autor: 'Marek' }],
  listy: [{ id: 'l1', name: 'Spożywcze', pozostalo: 4 }],
}

const PUSTE: DanePodsumowania = {
  dzien: '2026-09-09',
  wydarzenia: [],
  notatki: [],
  listy: [],
}

describe('zbudujPodsumowanie', () => {
  it('zachowuje kolejność, w jakiej dane przyszły z bazy', () => {
    const { tekst } = zbudujPodsumowanie(PELNE, ODBIORCA)
    expect(tekst.indexOf('Wakacje')).toBeLessThan(tekst.indexOf('Trening'))
  })

  it('wydarzenie odbiorcy jest wyróżnione gwiazdką', () => {
    const { tekst } = zbudujPodsumowanie(PELNE, ODBIORCA)
    expect(tekst).toContain('* 18:00 Trening — Ola')
    expect(tekst).toContain('  Cały dzień · Wakacje — Kuba')
  })

  it('ma wszystkie trzy sekcje, gdy jest czym je wypełnić', () => {
    const { tekst } = zbudujPodsumowanie(PELNE, ODBIORCA)
    expect(tekst).toContain('DZIŚ W KALENDARZU')
    expect(tekst).toContain('TABLICA')
    expect(tekst).toContain('ZAKUPY')
  })

  it('pomija sekcję, dla której nie ma treści', () => {
    const { tekst } = zbudujPodsumowanie({ ...PELNE, listy: [] }, ODBIORCA)
    expect(tekst).not.toContain('ZAKUPY')
  })

  it('pusty dzień to jedno zdanie, bez nagłówków sekcji', () => {
    const { tekst, temat } = zbudujPodsumowanie(PUSTE, ODBIORCA)
    expect(temat).toContain('spokojny dzień')
    expect(tekst).toContain('Spokojny dzień')
    expect(tekst).not.toContain('DZIŚ W KALENDARZU')
  })

  it('zwraca się do odbiorcy po imieniu', () => {
    expect(zbudujPodsumowanie(PUSTE, ODBIORCA).tekst).toContain('Dzień dobry, Ola!')
  })

  it('stopka mówi, gdzie to wyłączyć', () => {
    expect(zbudujPodsumowanie(PUSTE, ODBIORCA).tekst).toContain('Mój dom')
  })

  it('link pojawia się tylko wtedy, gdy jest dokąd prowadzić', () => {
    expect(zbudujPodsumowanie(PUSTE, ODBIORCA).html).not.toContain('<a ')
    expect(
      zbudujPodsumowanie(PUSTE, ODBIORCA, { linkAplikacji: 'https://kokpit.example' }).html,
    ).toContain('https://kokpit.example')
  })

  it('HTML ma style w atrybutach, bo klienci pocztowi nie czytają <style>', () => {
    const { html } = zbudujPodsumowanie(PELNE, ODBIORCA)
    expect(html).toContain('style="')
    expect(html).not.toContain('<style')
  })

  it('escapuje treść z bazy, żeby notatka nie wstrzyknęła znaczników', () => {
    const zlosliwa = {
      ...PUSTE,
      notatki: [{ id: 'n', content: '<b>hej</b>', pinned: false, autor: 'Ola' }],
    }
    expect(zbudujPodsumowanie(zlosliwa, ODBIORCA).html).toContain('&lt;b&gt;hej&lt;/b&gt;')
  })
})

describe('zbudujPodsumowanie - pokazStopke', () => {
  it('domyslnie pokazuje stopke (zgodnosc wsteczna z mailem)', () => {
    const { tekst } = zbudujPodsumowanie(PUSTE, ODBIORCA)
    expect(tekst).toContain('Wyłączysz to w Kokpicie')
  })

  it('pokazStopke:false chowa zdanie o wylaczeniu, ale nie reszte tekstu', () => {
    const { tekst } = zbudujPodsumowanie(PUSTE, ODBIORCA, { pokazStopke: false })
    expect(tekst).not.toContain('Wyłączysz to w Kokpicie')
    expect(tekst).toContain('Dzień dobry, Ola!')
  })

  it('link dziala tez bez stopki', () => {
    const { tekst, html } = zbudujPodsumowanie(PUSTE, ODBIORCA, {
      pokazStopke: false,
      linkAplikacji: 'https://kokpit.example',
    })
    expect(tekst).toContain('https://kokpit.example')
    expect(html).toContain('https://kokpit.example')
    expect(html).not.toContain('Wyłączysz to w Kokpicie')
  })
})

describe('zbudujPodsumowanie - etykietaKalendarza', () => {
  it('domyslnie naglowek sekcji mowi "DZIS" (mail zawsze dotyczy dzisiaj)', () => {
    const { tekst } = zbudujPodsumowanie(PELNE, ODBIORCA)
    expect(tekst).toContain('DZIŚ W KALENDARZU')
  })

  it('etykietaKalendarza nadpisuje naglowek sekcji, np. dla zapytania o jutro', () => {
    const { tekst } = zbudujPodsumowanie(PELNE, ODBIORCA, { etykietaKalendarza: 'JUTRO W KALENDARZU' })
    expect(tekst).toContain('JUTRO W KALENDARZU')
    expect(tekst).not.toContain('DZIŚ W KALENDARZU')
  })
})
