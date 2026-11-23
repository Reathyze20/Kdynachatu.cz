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
        <Link to="/admin/cabin?panel=members">Jiný panel</Link>
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

  it('bez změn odejde odkazem hned a zavření okna nezdržuje', async () => {
    renderAt(<CabinSettingsPanel />)
    await waitFor(() => expect(screen.getByTestId('cabin-settings-name-input')).toHaveValue('Chata U Lesa'))
    expect(fireBeforeUnload().defaultPrevented).toBe(false)

    await userEvent.click(screen.getByRole('link', { name: 'Nástěnka' }))

    expect(await screen.findByText('Stránka nástěnky')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('načtení bez úprav ani na chvíli nehlídá odchod ani neukáže neuložené změny (#327)', async () => {
    const addListener = vi.spyOn(window, 'addEventListener')
    const flashed: string[] = []
    // Záznamy mutací drží i uzly, které už další vykreslení stihlo odebrat.
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of [record.target, ...record.addedNodes, ...record.removedNodes]) {
          if (node.textContent?.includes('Máš neuložené změny')) flashed.push(node.textContent)
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    renderAt(<CabinSettingsPanel />)
    await waitFor(() => expect(screen.getByTestId('cabin-settings-name-input')).toHaveValue('Chata U Lesa'))
    observer.disconnect()

    expect(addListener.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(0)
    expect(flashed).toHaveLength(0)
  })

  it('s neuloženou změnou se odchod ptá: Zůstat změnu nechá, Odejít bez uložení odejde', async () => {
    const name = await renderEdited()
    expect(fireBeforeUnload().defaultPrevented).toBe(true)

    // Kotva na stejné stránce formulář neodmountuje, ta se neptá; query (?panel=) přepíná obsah správy, ta ano.
    await userEvent.click(screen.getByRole('link', { name: 'Kotva na stejné stránce' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Jiný panel' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Zůstat' }))

    await userEvent.click(screen.getByRole('link', { name: 'Nástěnka' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('neuložené změny')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Zůstat' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(name).toHaveValue('Chata U Lesa a Potoka')
    expect(screen.queryByText('Stránka nástěnky')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Nástěnka' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Odejít bez uložení' }))
    expect(await screen.findByText('Stránka nástěnky')).toBeInTheDocument()
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

  it('po uložení už odchod nic nezdržuje', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: { ...CABIN, name: 'Chata U Lesa a Potoka' } })
    await renderEdited()
    const bar = screen.getByTestId('cabin-settings-save-bar')
    expect(bar).toHaveTextContent('Máš neuložené změny')

    await userEvent.click(within(bar).getByTestId('cabin-settings-save-button'))
    await waitFor(() => expect(patch).toHaveBeenCalled())
    await waitFor(() => expect(bar).not.toHaveTextContent('Máš neuložené změny'))

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

  it('přepnutí záložky změny neztratí a Uložit změny je mimo záložky, po ruce na každé', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: CABIN })
    const name = await renderEdited()
    const tab = (id: string) => screen.getAllByTestId('cabin-settings-tab-button').find((b) => b.dataset.tabId === id)!
    const save = screen.getByTestId('cabin-settings-save-button')
    expect(save).toHaveTextContent('Uložit změny')
    expect(save.closest('.cs-tab-pane')).toBeNull()

    await userEvent.click(tab('tab-operations'))
    await userEvent.click(screen.getByTestId('cabin-settings-winterized-toggle'))
    await userEvent.click(tab('tab-modules'))
    await userEvent.click(tab('tab-basic'))

    expect(name).toHaveValue('Chata U Lesa a Potoka')
    await userEvent.click(save)
    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][1]).toMatchObject({ name: 'Chata U Lesa a Potoka', isWinterized: true })
  })
})

describe('lepivá lišta s Uložit změny stojí na tokenech (#260)', () => {
  const css = cabinSettingsCss.replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = (selector: string) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].split(',').some((s) => s.trim() === selector)).map((m) => m[2]).join(';')

  it('lišta drží u spodku, na mobilu nad navigací a bezpečnou zónou; tlačítko je hlavní akce 56 px', () => {
    expect(rule('.cs-save-bar')).toMatch(/position:\s*sticky/)
    expect(rule('.cs-save-bar')).toMatch(/bottom:\s*calc\(var\(--mobile-nav-height\)[^;]*env\(safe-area-inset-bottom/)
    expect(rule('.cs-btn-save')).toMatch(/min-height:\s*var\(--touch-target-primary\)/)
    expect(rule('.cs-btn-save')).toMatch(/font-size:\s*var\(--font-size-base\)/)
  })
})
