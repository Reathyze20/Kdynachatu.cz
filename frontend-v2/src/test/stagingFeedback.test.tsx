import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { TestingChecklist } from '@/features/staging/TestingChecklist'
import { TESTING_TASKS } from '@/features/staging/testingTasks'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-mamka', username: 'demo-mamka' } }) }))

const FIELD = 'Co ti nešlo / co ti chybí?'

async function renderTaskItem(title: RegExp) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}><TestingChecklist /></MemoryRouter>
    </QueryClientProvider>,
  )
  const card = await screen.findByRole('region', { name: 'Co vyzkoušet' })
  return { card, item: within(within(card).getByText(title).closest('li') as HTMLElement) }
}

describe('zpětná vazba v kartě „Co vyzkoušet“ (staging)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    // Neprázdné testovací účty = staging
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { accounts: [{ username: 'demo-mamka', label: 'Mamka', role: 'user', password: 'x' }] } })
  })

  it('offers a field for every task plus a general one', async () => {
    const { card } = await renderTaskItem(/Přidej něco/)
    expect(within(card).getAllByLabelText(FIELD)).toHaveLength(TESTING_TASKS.length)
    expect(within(card).getByLabelText('Cokoli dalšího')).toBeInTheDocument()
  })

  it.each([
    ['nakup', /Přidej něco do nákupního seznamu/, FIELD],
    ['general', null, 'Cokoli dalšího'],
  ])('sends %s with screen and window width, then thanks and empties the field', async (taskId, title, label) => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { id: 'f1', createdAt: '2026-11-24T10:00:00.000Z' } })
    const { card, item } = await renderTaskItem(title ?? /Přidej něco/)
    const field = (title ? item : within(card)).getByLabelText(label)
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
    const { item } = await renderTaskItem(/Pošli zprávu do chatu/)
    const field = item.getByLabelText(FIELD)
    await userEvent.type(field, 'Chat se nenačetl')
    await userEvent.click(item.getByRole('button', { name: 'Odeslat' }))

    expect(await item.findByRole('alert')).toHaveTextContent('Nepodařilo se odeslat')
    expect(field).toHaveValue('Chat se nenačetl')
  })
})
