import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { TestingChecklist } from '@/features/staging/TestingChecklist'
import { TESTING_TASKS, checklistStorageKey } from '@/features/staging/testingTasks'

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { userId: 'u-mamka', username: 'demo-mamka' } }),
}))

const STAGING_ACCOUNTS = [{ username: 'demo-mamka', label: 'Mamka', role: 'user', password: 'Clen-heslo-4567' }]
const STORAGE_KEY = checklistStorageKey('u-mamka')

function mockDemoAccounts(accounts: unknown[]) {
  vi.spyOn(apiClient, 'get').mockImplementation((url: string) => {
    if (url === '/demo-accounts') {
      return Promise.resolve({ data: { accounts } }) as ReturnType<typeof apiClient.get>
    }
    return Promise.reject(new Error(`neočekávané volání ${url}`)) as ReturnType<typeof apiClient.get>
  })
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderChecklist() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <TestingChecklist />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('karta „Co vyzkoušet“ (staging)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('opens by itself on staging with every task listed', async () => {
    mockDemoAccounts(STAGING_ACCOUNTS)
    renderChecklist()

    const card = await screen.findByRole('region', { name: 'Co vyzkoušet' })
    expect(within(card).getAllByRole('listitem')).toHaveLength(7)
    expect(within(card).getByText(/Zarezervuj si víkend v kalendáři/)).toBeInTheDocument()
  })

  it('renders neither the card nor the button outside staging', async () => {
    mockDemoAccounts([])
    renderChecklist()

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/demo-accounts'))
    expect(screen.queryByRole('region', { name: 'Co vyzkoušet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Co vyzkoušet/ })).not.toBeInTheDocument()
  })

  it('starts collapsed when every task is done and the button opens the card', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(TESTING_TASKS.map((t) => t.id)))
    mockDemoAccounts(STAGING_ACCOUNTS)
    renderChecklist()

    const toggle = await screen.findByRole('button', { name: /Co vyzkoušet/ })
    expect(screen.queryByRole('region', { name: 'Co vyzkoušet' })).not.toBeInTheDocument()

    await userEvent.click(toggle)
    expect(screen.getByRole('region', { name: 'Co vyzkoušet' })).toBeInTheDocument()
  })

  it('remembers ticked tasks across a remount and lets the tick be undone', async () => {
    mockDemoAccounts(STAGING_ACCOUNTS)
    const first = renderChecklist()

    const done = await screen.findByRole('checkbox', { name: /Hotovo: Přidej něco do nákupního seznamu/ })
    await userEvent.click(done)
    expect(done).toBeChecked()
    first.unmount()

    renderChecklist()
    const again = await screen.findByRole('checkbox', { name: /Hotovo: Přidej něco do nákupního seznamu/ })
    expect(again).toBeChecked()

    await userEvent.click(again)
    expect(again).not.toBeChecked()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([])
  })

  it('closes and reopens', async () => {
    mockDemoAccounts(STAGING_ACCOUNTS)
    renderChecklist()

    await screen.findByRole('region', { name: 'Co vyzkoušet' })
    await userEvent.click(screen.getByRole('button', { name: 'Zavřít seznam Co vyzkoušet' }))
    expect(screen.queryByRole('region', { name: 'Co vyzkoušet' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Co vyzkoušet/ }))
    expect(screen.getByRole('region', { name: 'Co vyzkoušet' })).toBeInTheDocument()
  })

  it.each([
    ['Rozhlédni se po přehledu', '/dashboard'],
    ['Zarezervuj si víkend v kalendáři', '/reservations'],
    ['Přidej něco do nákupního seznamu', '/shopping'],
    ['Napiš poznámku k měsíci', '/reservations'],
    ['Pošli zprávu do chatu', '/notes'],
    ['Projdi předávku chaty', '/reservations?sekce=predavka'],
    ['Prohlédni si galerii', '/gallery'],
  ])('"Ukaž mi kde" for "%s" goes to %s and collapses the card', async (title, path) => {
    mockDemoAccounts(STAGING_ACCOUNTS)
    renderChecklist()

    const card = await screen.findByRole('region', { name: 'Co vyzkoušet' })
    const item = within(card).getByText(new RegExp(title)).closest('li')
    expect(item).not.toBeNull()
    await userEvent.click(within(item as HTMLElement).getByRole('link', { name: /Ukaž mi kde/ }))

    expect(screen.getByTestId('location').textContent).toBe(path)
    expect(screen.queryByRole('region', { name: 'Co vyzkoušet' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Co vyzkoušet/ })).toBeInTheDocument()
  })
})
