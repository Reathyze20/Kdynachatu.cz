import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi, type Invite } from '@/api/admin'
import { AdminPage } from '@/features/admin/AdminPage'
import { CopyForWhatsAppButton } from '@/components/shared/CopyForWhatsAppButton'
import * as toast from '@/lib/toast'
import { whatsAppMessage } from '@/lib/whatsapp'

// #264: kopírování pro WhatsApp je jedna akce se stejným názvem, tlačítko s textem
// a po zkopírování viditelné a ohlášené potvrzení.

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, user: { id: 'u-admin', username: 'Správce' } }),
}))
vi.mock('@/features/admin/components/AdminSectionMenu', () => ({ AdminSectionMenu: () => null }))
vi.mock('@/features/admin/components/SystemStatsPanel', () => ({ SystemStatsPanel: () => null }))
vi.mock('@/features/settings/CabinSettingsPage', () => ({ CabinSettingsPanel: () => null }))

function mockClipboard(writeText: (text: string) => Promise<void>) {
  const spy = vi.fn(writeText)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: spy }, configurable: true })
  return spy
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('CopyForWhatsAppButton (#264)', () => {
  it('je tlačítko s textem „Zkopírovat pro WhatsApp“, ne jen ikona', () => {
    render(<CopyForWhatsAppButton text="Ahoj" />)
    expect(screen.getByRole('button', { name: 'Zkopírovat pro WhatsApp' })).toHaveTextContent('Zkopírovat pro WhatsApp')
  })

  it('zkopíruje text a potvrzení je vidět na tlačítku i ohlášené čtečce', async () => {
    const writeText = mockClipboard(() => Promise.resolve())
    render(<CopyForWhatsAppButton text="Zítra jedu na chatu." />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('')

    fireEvent.click(screen.getByRole('button', { name: 'Zkopírovat pro WhatsApp' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Zítra jedu na chatu.'))
    expect(await screen.findByRole('button', { name: 'Zkopírováno' })).toBeInTheDocument()
    expect(status).toHaveTextContent('Zkopírováno pro WhatsApp')
  })

  it('potvrzení po chvíli zmizí a tlačítko jde použít znovu', async () => {
    vi.useFakeTimers()
    mockClipboard(() => Promise.resolve())
    render(<CopyForWhatsAppButton text="Ahoj" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Zkopírovat pro WhatsApp' }))
    })
    expect(screen.getByRole('button', { name: 'Zkopírováno' })).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(2500))
    expect(screen.getByRole('button', { name: 'Zkopírovat pro WhatsApp' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('když prohlížeč kopírování nepovolí, ukáže chybu a potvrzení ne', async () => {
    mockClipboard(() => Promise.reject(new Error('denied')))
    const showToast = vi.spyOn(toast, 'showToast').mockImplementation(() => {})
    render(<CopyForWhatsAppButton text="Ahoj" />)

    fireEvent.click(screen.getByRole('button', { name: 'Zkopírovat pro WhatsApp' }))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('nepodařilo'), 'error'))
    expect(screen.getByRole('button', { name: 'Zkopírovat pro WhatsApp' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('volající může chybu kopírování obsloužit sám', async () => {
    mockClipboard(() => Promise.reject(new Error('denied')))
    const showToast = vi.spyOn(toast, 'showToast').mockImplementation(() => {})
    const onError = vi.fn()
    render(<CopyForWhatsAppButton text="Ahoj" onError={onError} />)

    fireEvent.click(screen.getByRole('button', { name: 'Zkopírovat pro WhatsApp' }))

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(showToast).not.toHaveBeenCalled()
  })
})

it('po úspěšném zkopírování dá vědět volajícímu (třeba schovat starou chybu)', async () => {
  mockClipboard(() => Promise.resolve())
  const onCopied = vi.fn()
  render(<CopyForWhatsAppButton text="Ahoj" onCopied={onCopied} />)

  fireEvent.click(screen.getByRole('button', { name: 'Zkopírovat pro WhatsApp' }))

  await waitFor(() => expect(onCopied).toHaveBeenCalledTimes(1))
})

describe('whatsAppMessage', () => {
  it('přidá pod zprávu odkaz do aplikace', () => {
    expect(whatsAppMessage('Dochází káva.', '/shopping')).toBe(`Dochází káva.\n${window.location.origin}/shopping`)
  })
})

describe('pozvánka v administraci (#264)', () => {
  const INVITE: Invite = {
    id: 'inv-1',
    token: 'tok-1',
    role: 'guest',
    maxUses: 1,
    usedCount: 0,
    createdAt: '2026-11-20T10:00:00.000Z',
    expiresAt: '2099-12-31T10:00:00.000Z',
    cabinName: 'Chata U Lesa',
    createdBy: { username: 'Jana' },
  }

  it('text pozvánky se kopíruje stejně pojmenovaným tlačítkem „Zkopírovat pro WhatsApp“', async () => {
    vi.spyOn(adminApi, 'getUsers').mockResolvedValue([])
    vi.spyOn(adminApi, 'getInvites').mockResolvedValue([INVITE])
    const writeText = mockClipboard(() => Promise.resolve())
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/invites']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const card = await screen.findByTestId('invite-card')
    fireEvent.click(within(card).getByRole('button', { name: 'Zkopírovat pro WhatsApp' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`${window.location.origin}/invite/tok-1`)))
    expect(await within(card).findByRole('button', { name: 'Zkopírováno' })).toBeInTheDocument()
  })
})
