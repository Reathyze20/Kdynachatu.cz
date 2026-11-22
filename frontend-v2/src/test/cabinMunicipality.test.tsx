import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { RegisterForm } from '@/features/auth/RegisterForm'
import { CabinSettingsPanel } from '@/features/settings/CabinSettingsPage'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))

const TREBENICE = [
  { code: 565768, name: 'Třebenice', district: 'Litoměřice', region: 'Ústecký kraj' },
  { code: 591866, name: 'Třebenice', district: 'Třebíč', region: 'Kraj Vysočina' },
]

const CABIN = {
  id: 'c-1', name: 'Chata U Lesa', subdomain: 'u-lesa', description: null, welcomeMessage: null, rules: null,
  departureChecklist: ['Zavřít vodu'], coverPhotoUrl: null, isWinterized: false, features: {},
  weatherLocation: 'Trebenice', municipalityCode: null, municipalityName: null, municipalityDistrict: null,
  municipalityRegion: null, latitude: null, longitude: null,
}

function mockGet(cabin = CABIN) {
  vi.spyOn(apiClient, 'get').mockImplementation(((url: string) =>
    Promise.resolve({ data: url === '/municipalities' ? { municipalities: TREBENICE } : cabin })) as typeof apiClient.get)
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

async function pickTrebic(inputTestId: string) {
  await userEvent.type(screen.getByTestId(inputTestId), 'Třebe')
  await userEvent.click(await screen.findByRole('option', { name: /okres Třebíč/ }))
}

describe('nejbližší obec při registraci chaty', () => {
  beforeEach(() => vi.restoreAllMocks())

  async function fillAccount() {
    await userEvent.type(screen.getByTestId('register-cabin-name-input'), 'Chata U Lesa')
    await userEvent.type(screen.getByTestId('register-username-input'), 'novak')
    await userEvent.type(screen.getByTestId('register-email-input'), 'novak@example.com')
    await userEvent.type(screen.getByTestId('register-password-input'), 'Heslo-123456')
  }

  it('does not register a cabin without a municipality picked from the list', async () => {
    mockGet()
    const post = vi.spyOn(apiClient, 'post')
    renderWithClient(<RegisterForm onShowLogin={vi.fn()} onShowVerify={vi.fn()} />)

    await fillAccount()
    await userEvent.type(screen.getByTestId('register-municipality-input'), 'Třebenice')
    await userEvent.click(screen.getByTestId('register-submit-button'))

    expect(await screen.findByText('Vyber nejbližší obec ze seznamu.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('sends the code of the picked municipality', async () => {
    mockGet()
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { requiresVerification: true } })
    renderWithClient(<RegisterForm onShowLogin={vi.fn()} onShowVerify={vi.fn()} />)

    await fillAccount()
    await pickTrebic('register-municipality-input')
    await userEvent.click(screen.getByTestId('register-submit-button'))

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).toMatchObject({ cabinName: 'Chata U Lesa', municipalityCode: 591866 })
    expect(post.mock.calls[0][1]).not.toHaveProperty('weatherLocation')
  })
})

describe('nejbližší obec v nastavení chaty', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('asks a cabin with a legacy text location to pick a municipality and saves the pick', async () => {
    mockGet()
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: CABIN })
    renderWithClient(<CabinSettingsPanel />)

    expect(await screen.findByTestId('cabin-settings-legacy-location')).toHaveTextContent('„Trebenice“')
    await pickTrebic('cabin-settings-municipality-input')
    await userEvent.click(screen.getByTestId('cabin-settings-save-button'))

    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][1]).toMatchObject({ municipalityCode: 591866 })
  })

  it('keeps the legacy text location when the municipality is left untouched', async () => {
    mockGet()
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: CABIN })
    renderWithClient(<CabinSettingsPanel />)

    await screen.findByTestId('cabin-settings-legacy-location')
    await userEvent.click(screen.getByTestId('cabin-settings-save-button'))

    await waitFor(() => expect(patch).toHaveBeenCalled())
    // undefined Axios do JSON nepošle, server pak textovou lokalitu nechá být
    expect((patch.mock.calls[0][1] as { municipalityCode?: number | null }).municipalityCode).toBeUndefined()
  })

  it('does not save typed text without a pick', async () => {
    mockGet()
    const patch = vi.spyOn(apiClient, 'patch')
    renderWithClient(<CabinSettingsPanel />)

    await userEvent.type(await screen.findByTestId('cabin-settings-municipality-input'), 'Třebenice')
    await userEvent.click(screen.getByTestId('cabin-settings-save-button'))

    expect(patch).not.toHaveBeenCalled()
  })

  it('shows a picked municipality with its district', async () => {
    mockGet({ ...CABIN, weatherLocation: 'Třebenice', municipalityCode: 591866, municipalityName: 'Třebenice', municipalityDistrict: 'Třebíč', municipalityRegion: 'Kraj Vysočina', latitude: 49.1638, longitude: 16.0158 })
    renderWithClient(<CabinSettingsPanel />)

    await waitFor(() => expect(screen.getByTestId('cabin-settings-municipality-input')).toHaveValue('Třebenice (okres Třebíč)'))
    expect(screen.queryByTestId('cabin-settings-legacy-location')).not.toBeInTheDocument()
  })
})
