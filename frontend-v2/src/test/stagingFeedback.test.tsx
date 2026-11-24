import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { TestingChecklist } from '@/features/staging/TestingChecklist'
import { TESTING_TASKS } from '@/features/staging/testingTasks'

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { userId: 'u-mamka', username: 'demo-mamka' } }),
}))

const STAGING_ACCOUNTS = [{ username: 'demo-mamka', label: 'Mamka', role: 'user', password: 'Clen-heslo-4567' }]

function mockStaging() {
  vi.spyOn(apiClient, 'get').mockImplementation((url: string) => {
    if (url === '/demo-accounts') {
      return Promise.resolve({ data: { accounts: STAGING_ACCOUNTS } }) as ReturnType<typeof apiClient.get>
    }
    return Promise.reject(new Error(`neočekávané volání ${url}`)) as ReturnType<typeof apiClient.get>
  })
}

function renderChecklist() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <TestingChecklist />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function taskItem(title: RegExp) {
  const card = await screen.findByRole('region', { name: 'Co vyzkoušet' })
  return within(within(card).getByText(title).closest('li') as HTMLElement)
}

describe('zpětná vazba v kartě „Co vyzkoušet“ (staging)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    mockStaging()
  })

  it('offers a feedback field for every task and one general field', async () => {
    renderChecklist()
    const card = await screen.findByRole('region', { name: 'Co vyzkoušet' })
    expect(within(card).getAllByLabelText('Co ti nešlo / co ti chybí?')).toHaveLength(TESTING_TASKS.length)
    expect(within(card).getByLabelText('Cokoli dalšího')).toBeInTheDocument()
  })

  it('sends the task, screen and window width, then thanks and empties the field', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { id: 'f1', createdAt: '2026-11-24T10:00:00.000Z' } })
    renderChecklist()
    const item = await taskItem(/Přidej něco do nákupního seznamu/)
    const field = item.getByLabelText('Co ti nešlo / co ti chybí?')

    expect(item.getByRole('button', { name: 'Odeslat' })).toBeDisabled()
    await userEvent.type(field, 'Nevím, kde přidat položku')
    await userEvent.click(item.getByRole('button', { name: 'Odeslat' }))

    expect(await item.findByText('Díky, uloženo')).toBeInTheDocument()
    expect(field).toHaveValue('')
    expect(post).toHaveBeenCalledWith('/staging-feedback', {
      taskId: 'nakup',
      text: 'Nevím, kde přidat položku',
      screen: '/dashboard',
      viewportWidth: window.innerWidth,
    })
  })

  it('sends the general field as "general"', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { id: 'f2', createdAt: '2026-11-24T10:00:00.000Z' } })
    renderChecklist()
    const field = await screen.findByLabelText('Cokoli dalšího')
    await userEvent.type(field, 'Chybí mi počasí')
    await userEvent.click(within(field.closest('form') as HTMLElement).getByRole('button', { name: 'Odeslat' }))

    expect(await screen.findByText('Díky, uloženo')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/staging-feedback', expect.objectContaining({ taskId: 'general', text: 'Chybí mi počasí' }))
  })

  it('keeps the text and explains the failure when sending fails', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(Object.assign(new Error('Request failed'), { response: { status: 500, data: {} } }))
    renderChecklist()
    const item = await taskItem(/Pošli zprávu do chatu/)
    const field = item.getByLabelText('Co ti nešlo / co ti chybí?')
    await userEvent.type(field, 'Chat se nenačetl')
    await userEvent.click(item.getByRole('button', { name: 'Odeslat' }))

    expect(await item.findByRole('alert')).toHaveTextContent('Nepodařilo se odeslat')
    expect(field).toHaveValue('Chat se nenačetl')
    expect(item.queryByText('Díky, uloženo')).not.toBeInTheDocument()
  })
})
