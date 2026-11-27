import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { MEMBER_PALETTE } from '@/lib/memberPalette'
import { RegisterForm } from '@/features/auth/RegisterForm'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'

// #649: profil i registrace vybírají barvu sdíleným ColorPickerem (tlačítka s 48px cílem, aria-pressed),
// ne vlastním kódem.

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(), login: vi.fn(), updateAnimalIcon: vi.fn(), isAdmin: false, isSuperAdmin: false, token: 'token',
    user: { userId: 'u-1', username: 'Jana', role: 'user', animalIcon: null, cabinId: 'cabin-1', isSuperAdmin: false },
  }),
}))
vi.mock('@/api/client', () => ({ default: api, apiClient: api }))

function renderPage(page: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MemoryRouter>{page}</MemoryRouter></QueryClientProvider>)
}

/** Skupina barev: osm tlačítek pojmenovaných podle palety, každé s dotykovým cílem 48 px. */
function expectSharedPicker(group: HTMLElement) {
  const buttons = within(group).getAllByRole('button')
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(MEMBER_PALETTE.map(({ name }) => name))
  for (const button of buttons) {
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveClass('size-12')
  }
}

describe('sdílený výběr barvy (#649)', () => {
  beforeEach(() => {
    api.get.mockReset().mockResolvedValue({ data: { email: 'jana@example.test', color: '#1F6F4A', animalIcon: null } })
    api.patch.mockReset().mockResolvedValue({ data: { message: 'ok' } })
    api.post.mockReset()
  })

  it('registrace: výchozí je první barva palety a klik vybere jinou', async () => {
    renderPage(<RegisterForm onShowLogin={vi.fn()} />)
    const group = screen.getByRole('group', { name: 'Barva profilu' })
    expectSharedPicker(group)
    const user = userEvent.setup()
    expect(within(group).getByRole('button', { name: 'modrá' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(group).getByRole('button', { name: 'cihlová' }))
    expect(within(group).getByRole('button', { name: 'cihlová' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'modrá' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('profil: uložená barva je vybraná a klik na jinou ji uloží', async () => {
    renderPage(<ProfileDrawer isOpen onClose={vi.fn()} />)
    const group = screen.getByRole('group', { name: 'Barva' })
    expectSharedPicker(group)
    await waitFor(() => expect(within(group).getByRole('button', { name: 'jedlová' })).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.setup().click(within(group).getByRole('button', { name: 'cihlová' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/me', { color: '#B3401A' }))
  })
})
