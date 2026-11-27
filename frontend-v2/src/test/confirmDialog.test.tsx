import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

// Potvrzovací dialog stojí na sdíleném Button (DESIGN.md §6, #526): zrušení je vedlejší akce,
// potvrzení hlavní, u nevratné akce destruktivní.
function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(<ConfirmDialog isOpen title="Smazat seznam" message="Seznam zmizí i s položkami." confirmLabel="Smazat" onConfirm={onConfirm} onCancel={onCancel} {...props} />)
  return { onConfirm, onCancel }
}

describe('ConfirmDialog (#526)', () => {
  it('nevratná akce má destruktivní potvrzení, zrušení je vedlejší tlačítko', () => {
    renderDialog({ danger: true })
    expect(screen.getByRole('button', { name: 'Smazat' })).toHaveAttribute('data-variant', 'danger')
    expect(screen.getByRole('button', { name: 'Zrušit' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('bez danger je potvrzení hlavní akce', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Smazat' })).toHaveAttribute('data-variant', 'primary')
  })

  it('při odesílání nejde potvrdit ani zrušit a potvrzení ohlásí zaneprázdnění', async () => {
    const { onConfirm, onCancel } = renderDialog({ loading: true })
    const confirm = screen.getByTestId('confirm-dialog-confirm-button')
    expect(confirm).toHaveAttribute('aria-busy', 'true')
    expect(confirm).toHaveTextContent('Smazat')
    await userEvent.click(confirm)
    await userEvent.click(screen.getByTestId('confirm-dialog-cancel-button'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
