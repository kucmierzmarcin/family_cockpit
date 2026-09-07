import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

type Props = {
  otwarty: boolean
  tytul: string
  onZamknij: () => void
  children: ReactNode
}

/**
 * Formularz wysuwany z dołu ekranu.
 *
 * Pułapka fokusa, Escape, `aria-modal`, blokada przewijania tła i przywrócenie
 * fokusa po zamknięciu przychodzą z Radiksa. Napisane ręcznie zajęłyby dzień
 * i wyszłyby gorzej.
 *
 * Uchwyt u góry jest ozdobą: arkusz zamyka krzyżyk, stuknięcie w tło i Escape.
 * Przeciągnięcie palcem w dół wymagałoby biblioteki gestów.
 */
export function Arkusz({ otwarty, tytul, onZamknij, children }: Props) {
  return (
    <Dialog.Root
      open={otwarty}
      onOpenChange={(otwiera) => {
        if (!otwiera) onZamknij()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="arkusz-tlo" />
        {/* aria-describedby={undefined} wycisza ostrzeżenie Radiksa o braku
            opisu - tytuł wystarcza, a zmyślony opis tylko zaśmieca odczyt. */}
        <Dialog.Content className="arkusz" aria-describedby={undefined}>
          <span className="arkusz-uchwyt" aria-hidden="true" />
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
