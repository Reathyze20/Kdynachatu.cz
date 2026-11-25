/**
 * #521 – dialog „Nová položka“ Rekonstrukce podle DESIGN.md: kategorie jako segmentový přepínač,
 * popisky bez ozdobných ikon s „(nepovinné)“ a tlačítka v patičce jako `Button` se stavem odesílání.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TaskFormModal } from '@/features/reconstruction/TaskFormModal'

function renderDialog(props: Partial<Parameters<typeof TaskFormModal>[0]> = {}) {
  const onSubmit = vi.fn()
  render(<TaskFormModal initialCategory="idea" editItem={null} onClose={vi.fn()} onSubmit={onSubmit} {...props} />)
  return { onSubmit }
}

describe('dialog nové položky Rekonstrukce podle DESIGN.md (#521)', () => {
  it('kategorie je segmentový přepínač: jedna skupina, vybraný segment je stisknutý', async () => {
    renderDialog()
    const group = screen.getByRole('group', { name: 'Kategorie' })
    const segments = within(group).getAllByRole('button')
    expect(segments.map((s) => s.textContent)).toEqual(['Nápad', 'Firma', 'Úkol'])
    expect(within(group).getByRole('button', { name: 'Nápad' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(group).getByRole('button', { name: 'Firma' }))

    expect(within(group).getByRole('button', { name: 'Firma' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Nápad' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: 'Nová firma' })).toBeInTheDocument()
    expect(screen.getByLabelText('Telefon (nepovinné)')).toBeInTheDocument()
  })

  it('titulek říká, co vzniká nebo se upravuje', () => {
    renderDialog({ initialCategory: 'task' })
    expect(screen.getByRole('heading', { name: 'Nový úkol' })).toBeInTheDocument()
  })

  it('titulek úpravy pojmenuje položku podle kategorie', () => {
    renderDialog({
      editItem: { id: 'c1', category: 'company', title: 'Tesařství', description: null, votes: [], createdAt: '2026-04-18T10:00:00.000Z' },
    })
    expect(screen.getByRole('heading', { name: 'Upravit firmu' })).toBeInTheDocument()
  })

  it('popisky jsou bez ozdobných ikon, nepovinná pole mají „(nepovinné)“', () => {
    renderDialog()
    expect(screen.getByLabelText('Název')).toBeRequired()
    for (const label of ['Popis (nepovinné)', 'Odkaz (nepovinné)', 'Náhledový obrázek (nepovinné)', 'Odhadovaná cena (nepovinné)']) {
      expect(screen.getByLabelText(label)).not.toBeRequired()
    }
    const form = screen.getByTestId('reconstruction-item-form')
    for (const label of form.querySelectorAll('label')) expect(label.querySelector('svg')).toBeNull()
  })

  it('při odesílání ukáže tlačítko průběh a nejde stisknout znovu', () => {
    renderDialog({ isLoading: true })
    const submit = screen.getByTestId('reconstruction-submit-button')
    expect(submit).toHaveTextContent('Ukládám…')
    expect(submit).toHaveAttribute('aria-busy', 'true')
    expect(submit).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Zrušit' })).toBeDisabled()
  })
})
