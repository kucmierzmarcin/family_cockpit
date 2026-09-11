import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

type Props = {
  otwarty: boolean
  tytul: string
  onZamknij: () => void
  children: ReactNode
}

/**
 * Formularz na komputerze: wyśrodkowane okienko zamiast zawsze widocznego
 * panelu obok kalendarza - kalendarz zostaje jedynym elementem ekranu, dopóki
 * ktoś naprawdę nie chce coś dodać albo zmienić.
 *
 * Ten sam wzorzec co `Arkusz` na telefonie (Radix Dialog: pułapka fokusa,
 * Escape, `aria-modal`, blokada przewijania tła, przywrócenie fokusa) - różni
 * się tylko pozycją i tym, że nie ma uchwytu do przeciągania.
 */
export function Popup({ otwarty, tytul, onZamknij, children }: Props) {
  return (
    <Dialog.Root
      open={otwarty}
      onOpenChange={(otwiera) => {
        if (!otwiera) onZamknij()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="arkusz-tlo" />
        <Dialog.Content className="popup" aria-describedby={undefined}>
          <div className="arkusz-pasek">
            <Dialog.Title className="panel-tytul">{tytul}</Dialog.Title>
            <Dialog.Close className="drobny arkusz-zamknij" aria-label="Zamknij">
              ×
            </Dialog.Close>
          </div>
          <div className="arkusz-tresc">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
