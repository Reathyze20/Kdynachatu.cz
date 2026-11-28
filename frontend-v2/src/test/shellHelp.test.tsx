import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { MobileNav } from '@/components/layout/MobileNav'

// Nápověda bez plovoucího tlačítka (#524): otevírá se z menu Víc a ze sidebaru. Fiktivní účet.

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(), login: vi.fn(), updateAnimalIcon: vi.fn(), isAdmin: false, isSuperAdmin: false, isGuest: false, token: 't',
    user: { userId: 'u-1', username: 'Jana', role: 'user', animalIcon: null, cabinId: 'c-1', isSuperAdmin: false },
  }),
}))
vi.mock('@/hooks/useCabinFeatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCabinFeatures')>()),
  useCabinFeatures: () => ({ data: { features: null, isWinterized: false } }),
}))
vi.mock('@/hooks/usePwaInstall', () => ({ usePwaInstall: () => ({ isStandalone: false, canInstall: null }) }))
vi.mock('@/api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { email: 'jana@example.test', color: '#5d9b62', animalIcon: null } }), patch: vi.fn() },
}))

const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx,css}', '!../test/**'], { query: '?raw', import: 'default', eager: true })

function renderAt(url: string, ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

async function expectHelpFor(heading: string) {
  const help = await screen.findByRole('dialog', { name: 'Nápověda k této stránce' })
  expect(within(help.querySelector<HTMLElement>('#help-modal-content')!).getByRole('heading', { level: 3 })).toHaveTextContent(heading)
}

describe('nápověda bez plovoucího tlačítka (#524)', () => {
  it('„Nápověda“ v menu Víc otevře nápovědu k právě otevřené stránce', async () => {
    const user = userEvent.setup()
    renderAt('/reservations', <MobileNav />)

    await user.click(screen.getByRole('button', { name: /Víc/ }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Víc' })).getByRole('button', { name: 'Nápověda' }))
    await expectHelpFor('Kalendář')
  })

  it('tělo nápovědy bere role typové škály, legacy třídy help-modal-* z help.css zmizely', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard', <MobileNav />)

    await user.click(screen.getByRole('button', { name: /Víc/ }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Víc' })).getByRole('button', { name: 'Nápověda' }))
    const body = (await screen.findByRole('dialog', { name: 'Nápověda k této stránce' })).querySelector<HTMLElement>('#help-modal-content')!
    expect(body.className).toMatch(/(^|\s)text-body(\s|$)/)
    for (const [file, source] of Object.entries(SOURCES)) expect(source, file).not.toMatch(/help-modal-(?!content)[\w-]+/)
  })

  it('plovoucí tlačítko nápovědy ani výjimky kvůli němu v kódu nezůstaly', () => {
    for (const [file, source] of Object.entries(SOURCES)) expect(source, file).not.toMatch(/fab-help|HelpFab/)
  })
})
