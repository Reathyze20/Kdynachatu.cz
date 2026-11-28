import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reservation } from '@/api/reservations'
import { ReservationDetail } from '@/features/reservations/ui/ReservationDetail'

// #222: detail pobytu předávku jen ukazuje (zrcadlo), členovi v okně předávky dá odkaz na tab Předávka.
// Host tab Předávka nemá (403), svou předávku proto dokončí dál v detailu pobytu. Fiktivní data.
const { api, auth } = vi.hoisted(() => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() }, auth: { userId: 'u-me', role: 'member' } }))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { userId: auth.userId, role: auth.role }, isGuest: auth.role === 'guest' }),
}))

const TODAY = '2030-11-29'
type Gas = 'full' | 'half' | 'low' | 'empty'

const completedStatus = (checkoutState: Record<string, unknown>) => ({ isCheckoutCompleted: true, checkoutCompletedBy: 'u-jana',
  checkoutCompletedByUsername: 'Jana', checkoutCompletedAt: '2030-11-29T09:30:00Z', checkoutState })
const mockCheckout = (status: unknown) =>
  api.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/reservations/r-1/checkout' ? status : null }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`))
  auth.userId = 'u-me'
  auth.role = 'member'
  api.get.mockImplementation(() => Promise.resolve({ data: null }))
  api.patch.mockResolvedValue({ data: completedStatus({}) })
  api.post.mockResolvedValue({ data: {} })
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

function renderDetail(overrides: Partial<Reservation> = {}) {
  const stay: Reservation = {
    id: 'r-1', userId: 'u-me', username: 'Eva', from: '2030-11-27', to: TODAY, purpose: 'Víkend',
    status: 'primary', isCheckoutCompleted: false, ...overrides,
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><MemoryRouter>
    <ReservationDetail reservation={stay} onBack={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />
  </MemoryRouter></QueryClientProvider>)
  return { card: screen.getByTestId('reservation-detail-card'), user: userEvent.setup() }
}

const handoverLink = (card: HTMLElement) => within(card).queryByRole('link', { name: 'Předat chatu' })
const noHandoverForm = (card: HTMLElement) => {
  expect(within(card).queryByRole('button', { name: 'Potvrdit odjezd' })).toBeNull()
  expect(within(card).queryByRole('group', { name: 'Plynová bomba' })).toBeNull()
  expect(within(card).queryByRole('textbox')).toBeNull()
}

describe('stay detail: completed handover is a read-only mirror', () => {
  // Host vidí dokončenou předávku stejně jako člen.
  it.each(['member', 'guest'])('%s sees "Chata předána", who and when, and the whole state without any form', async (role) => {
    auth.role = role
    mockCheckout(completedStatus({
      gas: 'low', heatingOff: true, waterOff: false, broken: 'kape kohoutek', leftBehind: 'dřevo u kamen', note: 'Užijte si to!',
    }))
    const { card } = renderDetail({ isCheckoutCompleted: true, userId: 'u-jana', username: 'Jana' })

    const mirror = await within(card).findByRole('region', { name: 'Chata předána' })
    expect(mirror).toHaveTextContent('Předal/a Jana · 29. 11. 2030 v 10:30')
    expect(mirror).toHaveTextContent('Plynová bomba')
    expect(within(mirror).getByText('Dochází')).toBeInTheDocument()
    expect(mirror).toHaveTextContent('Topení vypnuté')
    expect(mirror).toHaveTextContent('Voda otevřená')
    expect(mirror).toHaveTextContent('Potřebuje pozornost: kape kohoutek')
    expect(mirror).toHaveTextContent('Nechal/a: dřevo u kamen')
    expect(mirror).toHaveTextContent('„Užijte si to!“')
    noHandoverForm(card)
    expect(handoverLink(card)).toBeNull()
  })

  // Slovník plynu (#166 = A) i v detailu pobytu: stará `half` je Dostatek, chybějící plyn se neukazuje.
  it.each<[Gas | null, string | null]>([
    ['full', 'Dostatek'], ['half', 'Dostatek'], ['low', 'Dochází'], ['empty', 'Došlo'], [null, null],
  ])('reads gas %s as %s', async (gas, expected) => {
    mockCheckout(completedStatus({ gas, note: 'Dřevo je u kamen.' }))
    const { card } = renderDetail({ isCheckoutCompleted: true })

    const mirror = await within(card).findByRole('region', { name: 'Chata předána' })
    if (expected) expect(within(mirror).getByText(expected)).toBeInTheDocument()
    else expect(mirror).not.toHaveTextContent('Plynová bomba')
    expect(mirror).not.toHaveTextContent(/Plný|Půl|Prázdný|Plyn:/i)
  })

  it('a mirror that failed to load says so and loads again on "Zkusit znovu"', async () => {
    api.get.mockImplementation((url: string) =>
      url === '/reservations/r-1/checkout' ? Promise.reject(new Error('boom')) : Promise.resolve({ data: null }))
    const { card, user } = renderDetail({ isCheckoutCompleted: true })

    const alert = await within(card).findByRole('alert')
    expect(alert).toHaveTextContent('Předávku se nepodařilo načíst')
    mockCheckout(completedStatus({ note: 'Dřevo je u kamen.' }))
    await user.click(within(alert).getByRole('button', { name: 'Zkusit znovu' }))

    expect(await within(card).findByRole('region', { name: 'Chata předána' })).toHaveTextContent('Dřevo je u kamen.')
  })
})

describe('stay detail: link to the Předávka tab', () => {
  it.each([
    ['my stay on its departure day', {}],
    ['my stay the day after departure', { from: '2030-11-25', to: '2030-11-28' }],
    ['a stay where I am a co-traveller', { userId: 'u-petr', username: 'Petr', participants: [{ userId: 'u-me', username: 'Eva' }] }],
  ])('%s without a handover links "Předat chatu" to /handover', (_case, overrides: Partial<Reservation>) => {
    const { card } = renderDetail(overrides)

    expect(handoverLink(card)).toHaveAttribute('href', '/handover')
    noHandoverForm(card)
  })

  it.each([
    ['someone else\'s stay in the window', { userId: 'u-petr', username: 'Petr' }],
    ['my future stay', { from: '2030-12-05', to: '2030-12-07' }],
    ['my ongoing stay before departure day', { from: '2030-11-28', to: '2030-12-01' }],
    ['my stay that ended two days ago', { from: '2030-11-24', to: '2030-11-27' }],
    ['my backup reservation', { status: 'backup' as const }],
  ])('%s shows nothing about the handover', (_case, overrides: Partial<Reservation>) => {
    const { card } = renderDetail(overrides)

    expect(handoverLink(card)).toBeNull()
    expect(within(card).queryByText(/Chata předána|Předat chatu/)).toBeNull()
    noHandoverForm(card)
  })
})

describe('stay detail: a guest still finishes their own handover here', () => {
  it('guest fills in the handover in the stay detail and it is sent through PATCH /checkout', async () => {
    auth.role = 'guest'
    const { card, user } = renderDetail()

    expect(handoverLink(card)).toBeNull()
    const gas = await within(card).findByRole('group', { name: 'Plynová bomba' })
    await user.click(within(gas).getByRole('button', { name: 'Došlo' }))
    await user.type(within(card).getByLabelText('Vzkaz pro dalšího (nepovinné)'), 'Klíč je u sousedů.')
    await user.click(within(card).getByRole('button', { name: 'Potvrdit odjezd' }))

    const body = { checkoutState: { gas: 'empty', note: 'Klíč je u sousedů.' } }
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/reservations/r-1/checkout', body))
  })
})
