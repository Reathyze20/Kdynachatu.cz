import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { apiClient } from '@/api/client'
import type { CabinConfig } from '@/api/settings'
import { CabinSettingsPage, CabinSettingsPanel } from '@/features/settings/CabinSettingsPage'
import cabinSettingsCss from '@/styles/cabin-settings.css?raw'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))

/**
 * #260: neuložené nastavení chaty nesmí tiše zmizet a „Uložit změny“ musí být po ruce na každé záložce.
 */

const CABIN: CabinConfig = {
  id: 'c-1', name: 'Chata U Lesa', subdomain: 'u-lesa', description: null, welcomeMessage: null, rules: null,
  departureChecklist: ['Zavřít vodu'], coverPhotoUrl: null, isWinterized: false, features: {},
  weatherLocation: null, municipalityCode: null, municipalityName: null, municipalityDistrict: null,
  municipalityRegion: null, latitude: null, longitude: null,
}

function renderAt(ui: ReactNode) {
  vi.spyOn(apiClient, 'get').mockResolvedValue({ data: CABIN })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/cabin']}>
        <Link to="/dashboard">Nástěnka</Link>
        <Link to="/admin/cabin#moduly">Kotva na stejné stránce</Link>
        <Routes>
          <Route path="/admin/cabin" element={ui} />
          <Route path="/admin" element={<p>Stránka správy</p>} />
          <Route path="/dashboard" element={<p>Stránka nástěnky</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function renderEdited() {
  renderAt(<CabinSettingsPanel />)
  const name = await screen.findByTestId('cabin-settings-name-input')
  await waitFor(() => expect(name).toHaveValue('Chata U Lesa'))
  await userEvent.type(name, ' a Potoka')
  return name
}

function fireBeforeUnload() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

describe('nastavení chaty: neuložené změny (#260)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('bez změn odejde odkazem hned, bez potvrzení', async () => {
    renderAt(<CabinSettingsPanel />)
    await waitFor(() => expect(screen.getByTestId('cabin-settings-name-input')).toHaveValue('Chata U Lesa'))

    await userEvent.click(screen.getByRole('link', { name: 'Nástěnka' }))

    expect(await screen.findByText('Stránka nástěnky')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('s neuloženou změnou se odkaz v aplikaci nejdřív zeptá a Zůstat změnu nechá', async () => {
    const name = await renderEdited()

    await userEvent.click(screen.getByRole('link', { name: 'Nástěnka' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('neuložené změny')
    expect(screen.queryByText('Stránka nástěnky')).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Zůstat' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(name).toHaveValue('Chata U Lesa a Potoka')
    expect(screen.queryByText('Stránka nástěnky')).not.toBeInTheDocument()
  })

  it('Odejít bez uložení dokončí podrženou navigaci', async () => {
    await renderEdited()

    await userEvent.click(screen.getByRole('link', { name: 'Nástěnka' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Odejít bez uložení' }))

    expect(await screen.findByText('Stránka nástěnky')).toBeInTheDocument()
  })

  it('kotva na stejné stránce se neptá, formulář zůstane', async () => {
    const name = await renderEdited()

    await userEvent.click(screen.getByRole('link', { name: 'Kotva na stejné stránce' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(name).toHaveValue('Chata U Lesa a Potoka')
  })

  it('tlačítko Zpět (programová navigace) se s neuloženou změnou taky zeptá', async () => {
    renderAt(<CabinSettingsPage />)
    const name = await screen.findByTestId('cabin-settings-name-input')
    await waitFor(() => expect(name).toHaveValue('Chata U Lesa'))
    await userEvent.type(name, '!')

    await userEvent.click(screen.getByTestId('cabin-settings-back-button'))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText('Stránka správy')).not.toBeInTheDocument()
  })

  it('zavření nebo obnovení okna zastaví jen s neuloženou změnou', async () => {
    renderAt(<CabinSettingsPanel />)
    const name = await screen.findByTestId('cabin-settings-name-input')
    await waitFor(() => expect(name).toHaveValue('Chata U Lesa'))
    expect(fireBeforeUnload().defaultPrevented).toBe(false)

    await userEvent.type(name, '!')
    expect(fireBeforeUnload().defaultPrevented).toBe(true)
  })

  it('po uložení už odchod nic nezdržuje', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: { ...CABIN, name: 'Chata U Lesa a Potoka' } })
    await renderEdited()
    expect(screen.getByTestId('cabin-settings-save-bar')).toHaveTextContent('Máš neuložené změny')

    await userEvent.click(screen.getByTestId('cabin-settings-save-button'))
    await waitFor(() => expect(patch).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('cabin-settings-save-bar')).not.toHaveTextContent('Máš neuložené změny'))

    expect(fireBeforeUnload().defaultPrevented).toBe(false)
    await userEvent.click(screen.getByRole('link', { name: 'Nástěnka' }))
    expect(await screen.findByText('Stránka nástěnky')).toBeInTheDocument()
  })

  it('vrácení hodnoty na uloženou změnu zruší', async () => {
    renderAt(<CabinSettingsPanel />)
    const toggles = await screen.findAllByTestId('cabin-settings-feature-toggle')

    await userEvent.click(toggles[0])
    expect(screen.getByTestId('cabin-settings-save-bar')).toHaveTextContent('Máš neuložené změny')
    await userEvent.click(toggles[0])

    expect(screen.getByTestId('cabin-settings-save-bar')).not.toHaveTextContent('Máš neuložené změny')
  })

  it('přepnutí záložky změny neztratí a uloží se změny ze všech záložek', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: CABIN })
    const name = await renderEdited()
    const tab = (id: string) => screen.getAllByTestId('cabin-settings-tab-button').find((b) => b.dataset.tabId === id)!

    await userEvent.click(tab('tab-operations'))
    await userEvent.click(screen.getByTestId('cabin-settings-winterized-toggle'))
    await userEvent.click(tab('tab-modules'))
    await userEvent.click(tab('tab-basic'))

    expect(name).toHaveValue('Chata U Lesa a Potoka')
    await userEvent.click(screen.getByTestId('cabin-settings-save-button'))
    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][1]).toMatchObject({ name: 'Chata U Lesa a Potoka', isWinterized: true })
  })

  it('Uložit změny je v liště mimo záložky, takže je po ruce na každé z nich', async () => {
    renderAt(<CabinSettingsPanel />)
    const bar = await screen.findByTestId('cabin-settings-save-bar')

    expect(within(bar).getByTestId('cabin-settings-save-button')).toHaveTextContent('Uložit změny')
    expect(bar.closest('.cs-tab-pane')).toBeNull()
  })
})

describe('lepivá lišta s Uložit změny stojí na tokenech (#260)', () => {
  const css = cabinSettingsCss.replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = (selector: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(',').some((s) => s.trim() === selector))
    .map((m) => m[2])
    .join(';')

  it('lišta je lepivá a na mobilu sedí nad spodní navigací i bezpečnou zónou', () => {
    expect(rule('.cs-save-bar')).toMatch(/position:\s*sticky/)
    expect(rule('.cs-save-bar')).toMatch(/bottom:\s*calc\(var\(--mobile-nav-height\)[^;]*env\(safe-area-inset-bottom/)
  })

  it('tlačítko je hlavní akce 56 px s písmem z tokenu', () => {
    expect(rule('.cs-btn-save')).toMatch(/min-height:\s*var\(--touch-target-primary\)/)
    expect(rule('.cs-btn-save')).toMatch(/font-size:\s*var\(--font-size-base\)/)
    expect(rule('.cs-btn-save')).not.toMatch(/font-size:\s*0\.95rem/)
  })
})
