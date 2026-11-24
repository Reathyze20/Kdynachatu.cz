import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { TestingChecklist } from '@/features/staging/TestingChecklist'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-mamka', username: 'demo-mamka' } }) }))

const FIELD = 'Co ti nešlo / co ti chybí?'

/** Karta s úkolem `title` (šipkou ›); `null` = zůstane na prvním úkolu */
async function renderCardAt(title: RegExp | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}><TestingChecklist /></MemoryRouter>
    </QueryClientProvider>,
  )
  const card = within(await screen.findByRole('region', { name: 'Co vyzkoušet' }))
  for (let i = 0; title && i < 7 && !card.queryByText(title); i++) {
    await userEvent.click(card.getByRole('button', { name: 'Další úkol' }))
  }
  return card
}

describe('zpětná vazba v kartě „Co vyzkoušet“ (staging)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    // Neprázdné testovací účty = staging
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { accounts: [{ username: 'demo-mamka', label: 'Mamka', role: 'user', password: 'x' }] } })
  })

  it('hides the fields until the tester asks for them; the general one is offered too', async () => {
    const card = await renderCardAt(/Přidej něco/)
    expect(card.queryByLabelText(FIELD)).not.toBeInTheDocument()
    expect(card.queryByLabelText('Cokoli dalšího')).not.toBeInTheDocument()

    await userEvent.click(card.getByRole('button', { name: 'Napsat, co nešlo' }))
    expect(card.getByLabelText(FIELD)).toBeInTheDocument()

    await userEvent.click(card.getByRole('button', { name: 'Cokoli dalšího' }))
    expect(card.getByLabelText('Cokoli dalšího')).toBeInTheDocument()
  })

  it.each([
    ['nakup', /Přidej něco do nákupního seznamu/, 'Napsat, co nešlo', FIELD],
    ['general', null, 'Cokoli dalšího', 'Cokoli dalšího'],
  ])('sends %s with screen and window width, then thanks and empties the field', async (taskId, title, opener, label) => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { id: 'f1', createdAt: '2026-11-24T10:00:00.000Z' } })
    const card = await renderCardAt(title)
    await userEvent.click(card.getByRole('button', { name: opener }))
    const field = card.getByLabelText(label)
    const form = within(field.closest('form') as HTMLElement)

    expect(form.getByRole('button', { name: 'Odeslat' })).toBeDisabled()
    await userEvent.type(field, '  Nevím, kde přidat položku ')
    await userEvent.click(form.getByRole('button', { name: 'Odeslat' }))

    expect(await form.findByText('Díky, uloženo')).toBeInTheDocument()
    expect(field).toHaveValue('')
    expect(post).toHaveBeenCalledWith('/staging-feedback', {
      taskId, text: 'Nevím, kde přidat položku', screen: '/dashboard', viewportWidth: window.innerWidth,
    })
  })

  it('keeps the text and explains the failure when sending fails', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(Object.assign(new Error('Request failed'), { response: { status: 500, data: {} } }))
    const card = await renderCardAt(/Pošli zprávu do chatu/)
    await userEvent.click(card.getByRole('button', { name: 'Napsat, co nešlo' }))
    const field = card.getByLabelText(FIELD)
    await userEvent.type(field, 'Chat se nenačetl')
    await userEvent.click(card.getByRole('button', { name: 'Odeslat' }))

    expect(await card.findByRole('alert')).toHaveTextContent('Nepodařilo se odeslat')
    expect(field).toHaveValue('Chat se nenačetl')
  })
})
