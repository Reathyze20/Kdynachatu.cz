import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelpDialog } from '@/components/shared/HelpDialog'
import { OfflineBanner } from '@/components/shared/OfflineBanner'

let onlineState = true

function setNavigatorOnline(value: boolean) {
  onlineState = value
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

function renderHelp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <HelpDialog isOpen onClose={() => {}} />
    </MemoryRouter>,
  )
}

describe('HelpDialog and OfflineBanner', () => {
  beforeEach(() => {
    onlineState = true
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => onlineState,
    })
  })

  it('shows route-specific help for reservations', async () => {
    renderHelp('/reservations')

    expect(await screen.findByRole('dialog', { name: 'Nápověda k této stránce' })).toBeInTheDocument()
    expect(screen.getByText('Kalendář')).toBeInTheDocument()
    expect(screen.getByText(/Kdo kdy jede na chatu/)).toBeInTheDocument()
  })

  it('shows dedicated help content for cabin settings', async () => {
    renderHelp('/admin/cabin')

    expect(await screen.findByText('Nastavení chaty')).toBeInTheDocument()
    expect(screen.getByText(/součástí administrace chaty/)).toBeInTheDocument()
  })

  it('shows dedicated help content for diagnostics', async () => {
    renderHelp('/admin/diagnostics')

    expect(await screen.findByText('Diagnostika')).toBeInTheDocument()
    expect(screen.getByText(/samostatná provozní stránka/i)).toBeInTheDocument()
  })

  it('renders offline banner only while offline', async () => {
    render(<OfflineBanner />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    act(() => {
      setNavigatorOnline(false)
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Jsi offline')
    expect(screen.getByRole('alert')).toHaveTextContent('Změny provedené offline se uloží po obnovení připojení.')

    act(() => {
      setNavigatorOnline(true)
    })

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
