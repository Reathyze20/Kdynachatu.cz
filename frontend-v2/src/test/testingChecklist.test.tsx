import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
// `?raw` jako v layoutCss.test.ts – jsdom neumí layout, pozici karty hlídáme v CSS
import helpCssRaw from '@/styles/help.css?raw'
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

/** Šipkou › přepne kartu na úkol s daným textem */
async function showTask(title: string) {
  const card = await screen.findByRole('region', { name: 'Co vyzkoušet' })
  for (let i = 0; i < TESTING_TASKS.length && !within(card).queryByText(new RegExp(title)); i++) {
    await userEvent.click(within(card).getByRole('button', { name: 'Další úkol' }))
  }
  expect(within(card).getByText(new RegExp(title))).toBeInTheDocument()
  return card
}

const storedDone = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]

describe('karta „Co vyzkoušet“ (staging)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('opens by itself on staging showing one task at a time; arrows switch tasks', async () => {
    mockDemoAccounts(STAGING_ACCOUNTS)
    renderChecklist()

    const card = await screen.findByRole('region', { name: 'Co vyzkoušet' })
    expect(within(card).getByText(`Úkol 1 ze ${TESTING_TASKS.length}`)).toBeInTheDocument()
    expect(within(card).getByText(TESTING_TASKS[0].title)).toBeInTheDocument()
    expect(within(card).queryByText(TESTING_TASKS[1].title)).not.toBeInTheDocument()

    await userEvent.click(within(card).getByRole('button', { name: 'Další úkol' }))
    expect(within(card).getByText(`Úkol 2 ze ${TESTING_TASKS.length}`)).toBeInTheDocument()
    expect(within(card).getByText(TESTING_TASKS[1].title)).toBeInTheDocument()

    await userEvent.click(within(card).getByRole('button', { name: 'Předchozí úkol' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Předchozí úkol' }))
    expect(within(card).getByText(`Úkol ${TESTING_TASKS.length} ze ${TESTING_TASKS.length}`)).toBeInTheDocument()
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
    expect(toggle).toHaveTextContent(`Co vyzkoušet · ${TESTING_TASKS.length}/${TESTING_TASKS.length}`)
    expect(screen.queryByRole('region', { name: 'Co vyzkoušet' })).not.toBeInTheDocument()

    await userEvent.click(toggle)
    expect(screen.getByRole('region', { name: 'Co vyzkoušet' })).toBeInTheDocument()
  })

  it('"Hotovo" moves to the next unfinished task, skipping finished ones', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['rezervace']))
    mockDemoAccounts(STAGING_ACCOUNTS)
    renderChecklist()

    const card = await screen.findByRole('region', { name: 'Co vyzkoušet' })
    await userEvent.click(within(card).getByRole('button', { name: 'Hotovo' }))

    expect(within(card).getByText(/Přidej něco do nákupního seznamu/)).toBeInTheDocument()
    expect(within(card).getByText(`Úkol 3 ze ${TESTING_TASKS.length}`)).toBeInTheDocument()
    expect(storedDone()).toEqual(['rezervace', 'prehled'])
  })

  it('remembers ticked tasks across a remount and lets the tick be undone', async () => {
    mockDemoAccounts(STAGING_ACCOUNTS)
    const first = renderChecklist()

    const card = await showTask('Přidej něco do nákupního seznamu')
    await userEvent.click(within(card).getByRole('button', { name: 'Hotovo' }))
    expect(storedDone()).toEqual(['nakup'])
    first.unmount()

    renderChecklist()
    const again = await showTask('Přidej něco do nákupního seznamu')
    await userEvent.click(within(again).getByRole('button', { name: 'Vrátit odškrtnutí' }))
    expect(within(again).getByRole('button', { name: 'Hotovo' })).toBeInTheDocument()
    expect(storedDone()).toEqual([])
  })

  it('collapses after the last task is done', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(TESTING_TASKS.slice(1).map((t) => t.id)))
    mockDemoAccounts(STAGING_ACCOUNTS)
    renderChecklist()

    const card = await screen.findByRole('region', { name: 'Co vyzkoušet' })
    await userEvent.click(within(card).getByRole('button', { name: 'Hotovo' }))

    expect(screen.queryByRole('region', { name: 'Co vyzkoušet' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Co vyzkoušet/ })).toHaveTextContent(`${TESTING_TASKS.length}/${TESTING_TASKS.length}`)
  })

  it('collapses and reopens; the collapsed state survives a remount', async () => {
    mockDemoAccounts(STAGING_ACCOUNTS)
    const first = renderChecklist()

    await screen.findByRole('region', { name: 'Co vyzkoušet' })
    await userEvent.click(screen.getByRole('button', { name: 'Sbalit Co vyzkoušet' }))
    expect(screen.queryByRole('region', { name: 'Co vyzkoušet' })).not.toBeInTheDocument()
    first.unmount()

    renderChecklist()
    const toggle = await screen.findByRole('button', { name: /Co vyzkoušet/ })
    expect(toggle).toHaveTextContent(`Co vyzkoušet · 0/${TESTING_TASKS.length}`)
    expect(screen.queryByRole('region', { name: 'Co vyzkoušet' })).not.toBeInTheDocument()

    await userEvent.click(toggle)
    expect(screen.getByRole('region', { name: 'Co vyzkoušet' })).toBeInTheDocument()
  })

  it.each([
    ['Rozhlédni se po přehledu', '/dashboard'],
    ['Zarezervuj si víkend v kalendáři', '/reservations'],
    ['Přidej něco do nákupního seznamu', '/shopping'],
    ['Napiš poznámku k měsíci', '/reservations'],
    ['Pošli zprávu do chatu', '/notes'],
    ['Projdi předávku chaty', '/reservations?sekce=predavka'],
    ['Prohlédni si galerii', '/gallery', 'galerie'],
    ['Prohlédni si galerii', '/diary', 'deník'],
  ])('"Ukaž mi kde" for "%s" goes to %s and keeps the card open on the same task', async (title, path, place?: string) => {
    mockDemoAccounts(STAGING_ACCOUNTS)
    renderChecklist()

    const card = await showTask(title)
    await userEvent.click(within(card).getByRole('link', { name: place ? `Ukaž mi kde: ${place}` : 'Ukaž mi kde' }))

    expect(screen.getByTestId('location').textContent).toBe(path)
    expect(within(screen.getByRole('region', { name: 'Co vyzkoušet' })).getByText(new RegExp(title))).toBeInTheDocument()
  })

  it('floats outside the page flow: fixed, above the bottom nav on mobile', () => {
    const css = helpCssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).toMatch(/\.testing-card\s*\{[^}]*position:\s*fixed/)
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toMatch(/\.testing-card\s*\{[^}]*bottom:\s*calc\(var\(--mobile-nav-height\)/)
  })
})
