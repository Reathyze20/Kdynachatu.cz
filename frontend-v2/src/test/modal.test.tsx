import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from '@/components/shared/Modal'
import modalCss from '@/styles/modal.css?raw'
import navCss from '@/styles/nav.css?raw'
import variablesCss from '@/styles/variables.css?raw'

/**
 * Sdílený Modal na primitivu ui/dialog (#453, DESIGN.md §6): Esc, klik na pozadí, `persistent`,
 * focus do dialogu a zpět, titulek jako přístupné jméno a bottom sheet do 640 px.
 */

function Harness({ persistent = false, withInput = false, onClose = vi.fn() }) {
  const [open, setOpen] = useState(false)
  const close = () => { onClose(); setOpen(false) }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Otevřít</button>
      <Modal
        isOpen={open}
        onClose={close}
        title="Upravit položku"
        persistent={persistent}
        footer={<button type="button">Uložit</button>}
      >
        {withInput ? <input aria-label="Název" /> : <p>Obsah dialogu</p>}
      </Modal>
    </>
  )
}

async function openHarness(props: Parameters<typeof Harness>[0] = {}) {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(<Harness onClose={onClose} {...props} />)
  const trigger = screen.getByRole('button', { name: 'Otevřít' })
  await user.click(trigger)
  const dialog = await screen.findByRole('dialog', { name: 'Upravit položku' })
  return { user, onClose, trigger, dialog }
}

describe('Modal', () => {
  it('titulek je přístupné jméno dialogu', async () => {
    const { dialog } = await openHarness()
    expect(within(dialog).getByTestId('modal-title')).toHaveTextContent('Upravit položku')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('Esc dialog zavře', async () => {
    const { user, onClose } = await openHarness()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('klik na pozadí dialog zavře, klik do karty ne', async () => {
    const { user, onClose, dialog } = await openHarness()
    await user.click(within(dialog).getByText('Obsah dialogu'))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByTestId('modal-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('persistent blokuje Esc i klik na pozadí, křížek dál zavírá', async () => {
    const { user, onClose } = await openHarness({ persistent: true })
    await user.keyboard('{Escape}')
    fireEvent.click(screen.getByTestId('modal-overlay'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Zavřít' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('focus jde do dialogu a po zavření se vrací na tlačítko, které ho otevřelo', async () => {
    const { user, trigger, dialog } = await openHarness()
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))

    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('s polem formuláře dostane focus první pole', async () => {
    const { dialog } = await openHarness({ withInput: true })
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Název' })).toHaveFocus())
  })

  it('Tab zůstává v dialogu: z poslední akce skočí na první a Shift+Tab zpět', async () => {
    const { user, dialog } = await openHarness()
    const close = within(dialog).getByRole('button', { name: 'Zavřít' })
    await waitFor(() => expect(close).toHaveFocus())
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Uložit' })).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
  })

  it('dialog vykreslený rovnou otevřený vrátí po zavření focus tam, kde byl', async () => {
    const user = userEvent.setup()
    function OpenOnMount() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Otevřít zápisník</button>
          {open && <Modal isOpen onClose={() => setOpen(false)} title="Zápisník"><p>Obsah</p></Modal>}
        </>
      )
    }
    render(<OpenOnMount />)
    const trigger = screen.getByRole('button', { name: 'Otevřít zápisník' })
    await user.click(trigger)
    await screen.findByRole('dialog', { name: 'Zápisník' })
    await user.click(screen.getByRole('button', { name: 'Zavřít' }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('Esc ve vnořeném dialogu zavře jen horní', async () => {
    const outerClose = vi.fn()
    const innerClose = vi.fn()
    const nested = (innerOpen: boolean) => (
      <Modal isOpen onClose={outerClose} title="Zápisník">
        <p>Obsah</p>
        <Modal isOpen={innerOpen} onClose={innerClose} title="Zavřít bez uložení?">
          <p>Potvrzení</p>
        </Modal>
      </Modal>
    )
    const { rerender } = render(nested(false))
    await screen.findByRole('dialog', { name: 'Zápisník' })
    rerender(nested(true))
    await screen.findByRole('dialog', { name: 'Zavřít bez uložení?' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(innerClose).toHaveBeenCalledTimes(1)
    expect(outerClose).not.toHaveBeenCalled()
  })
})

describe('Modal do 640 px jako bottom sheet', () => {
  const sheet = modalCss.match(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
  const rule = (selector: string) =>
    sheet.match(new RegExp(`\\n\\s*${selector.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? ''

  it('pozadí přisaje kartu ke spodnímu okraji bez bočních a spodních mezer', () => {
    expect(rule('.modal-unified-overlay')).toMatch(/align-items:\s*flex-end/)
    expect(rule('.modal-unified-overlay')).toMatch(/padding:\s*var\(--space-[a-z]+\)\s+0\s+0;/)
  })

  it('karta má plnou šířku a zaoblené jen horní rohy', () => {
    expect(rule('.modal-unified-card')).toMatch(/max-width:\s*none/)
    expect(rule('.modal-unified-card')).toMatch(/border-radius:\s*16px 16px 0 0/)
  })
})

describe('Modal nad hlavičkou', () => {
  it('pozadí modálu překryje mobilní hlavičku (škála --z-*, komentář v #453)', () => {
    const zToken = (css: string, selector: string) =>
      css.match(new RegExp(String.raw`${selector.replace('.', '\\.')} \{[^}]*z-index: var\((--z-[a-z]+)[,)]`))?.[1]
    const zValue = (token?: string) => Number(variablesCss.match(new RegExp(String.raw`${token}: (\d+);`))?.[1])

    const header = zValue(zToken(navCss, '.mobile-header'))
    const overlay = zValue(zToken(modalCss, '.modal-unified-overlay'))
    expect(header).toBeGreaterThan(0)
    expect(overlay).toBeGreaterThan(header)
  })
})
