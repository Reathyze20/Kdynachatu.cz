import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '@/api/client'
import OnboardingPage from '@/features/onboarding/OnboardingPage'

// #525: onboarding je ve stejném rámu jako ostatní veřejné obrazovky (fotka, papírová karta, jedno h1 s názvem appky).

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), logout: vi.fn(), user: { username: 'Jana', cabinId: null } }),
}))

function renderOnboarding(cabinSignupEnabled: boolean) {
  vi.spyOn(apiClient, 'get').mockImplementation((url: string) => {
    if (url === '/signup-status') return Promise.resolve({ data: { cabinSignupEnabled } }) as ReturnType<typeof apiClient.get>
    return Promise.resolve({
      data: { token: 't', cabinId: null, userId: 'u1', username: 'Jana', role: 'member', animalIcon: null },
    }) as ReturnType<typeof apiClient.get>
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><MemoryRouter><OnboardingPage /></MemoryRouter></QueryClientProvider>)
}

describe('onboarding v rámu (#525)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it.each([
    ['založení chaty', true, 'onboarding-form', 'Vytvoř svůj prostor'],
    ['jen přes pozvánku', false, 'onboarding-invite-only', 'Do chaty se vstupuje přes pozvánku'],
  ])('%s: jedno h1 s názvem appky v rámu s fotkou, nadpis obrazovky jako h2', async (_name, enabled, testId, title) => {
    renderOnboarding(enabled)
    await screen.findByTestId(testId)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Kdy na chatu' }).closest('.photo-backdrop')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
  })

  it('kontrola přiřazení je stav v rámu, ne spinner', () => {
    renderOnboarding(true)
    expect(screen.getByRole('status')).toHaveTextContent('Kontroluji přiřazení k chatě…')
    expect(screen.getByRole('status').closest('.photo-backdrop')).not.toBeNull()
  })

  it('zkusit znovu a odhlásit jsou tlačítka s dotykovou plochou', async () => {
    renderOnboarding(true)
    await screen.findByTestId('onboarding-form')
    for (const name of ['Zkusit znovu', 'Odhlásit se']) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-(--touch-target-min)')
    }
  })
})
