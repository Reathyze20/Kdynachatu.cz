import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reservation } from '@/api/reservations'
import { ReservationsPage } from '@/features/reservations/ReservationsPage'

// Stránka rezervací v dvousloupcovém rámu (#209): kalendář v hlavním sloupci,
// seznam a detail v bočním panelu „Rezervace".

// Fixed "today" so the stay is in the shown month and in the future (past days are locked).
const ym = '2030-06'
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2030, 5, 1))
})
afterEach(() => vi.useRealTimers())

const stay: Reservation = {
  id: 'r-1', userId: 'u-petr', username: 'Petr', from: `${ym}-10`, to: `${ym}-12`, purpose: 'Víkend', status: 'primary',
}

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn((_url: string) => Promise.resolve({ data: null as unknown })) },
}))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-me', role: 'member' } }) }))

function renderPage(initialEntry = '/reservations') {
  api.get.mockImplementation((url: string) => {
    if (url === '/reservations') return Promise.resolve({ data: { reservations: [stay], availabilities: [] } })
    if (url.endsWith('/watch')) return Promise.resolve({ data: { watching: false } })
    if (url === '/cabin') return Promise.resolve({ data: { checkoutTasks: [] } })
    return Promise.resolve({ data: null })
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ReservationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

// The loading skeleton has the same panel, so wait for the loaded list first.
async function findPanel() {
  await screen.findByTestId('reservations-sidebar')
  return screen.getByRole('complementary', { name: 'Rezervace' })
}

const calendarHeading = () => screen.getByRole('heading', { level: 2, name: 'Červen 2030' })
const barsOf = (r: Reservation) => screen.getAllByTitle(`${r.username} (${r.purpose})`)

describe('reservations page: two-column frame', () => {
  it('renders the calendar in the main column and the list in the "Rezervace" panel', async () => {
    renderPage()
    const panel = await findPanel()

    expect(within(panel).getByText('Víkend')).toBeInTheDocument()
    expect(panel).not.toContainElement(calendarHeading())
    expect(screen.getByTestId('two-column-layout')).toContainElement(calendarHeading())
  })

  it('opens an empty booking form from the "Nová rezervace" button in the calendar header', async () => {
    const user = renderPage()
    const panel = await findPanel()

    const button = screen.getByRole('button', { name: 'Nová rezervace' })
    expect(panel).not.toContainElement(button)
    await user.click(button)

    const dialog = await screen.findByRole('dialog', { name: 'Nová rezervace' })
    expect(within(dialog).getByLabelText('Účel návštěvy')).toHaveValue('')
  })

  it('still opens a prefilled form from the dashboard link ?from=&to=', async () => {
    renderPage(`/reservations?from=${ym}-20&to=${ym}-22`)

    const dialog = await screen.findByRole('dialog', { name: 'Nová rezervace' })
    expect(within(dialog).getByLabelText('Příjezd')).toHaveValue(`${ym}-20`)
  })
})

describe('reservations page: detail in the side panel', () => {
  it('a list card opens the detail in the panel, keeps the calendar and marks the stay in the grid; "Zpět" returns the list', async () => {
    const user = renderPage()
    const panel = await findPanel()

    await user.click(within(panel).getByTestId('reservation-list-item'))

    const detail = within(panel).getByTestId('reservation-detail-card')
    expect(within(detail).getByText('Petr')).toBeInTheDocument()
    expect(calendarHeading()).toBeInTheDocument()
    for (const bar of barsOf(stay)) expect(bar).toHaveAttribute('aria-current', 'true')
    expect(screen.getAllByText('Vybraná rezervace')).toHaveLength(barsOf(stay).length)

    await user.click(within(panel).getByTestId('reservation-back-button'))

    expect(within(panel).queryByTestId('reservation-detail-card')).toBeNull()
    expect(within(panel).getByTestId('reservation-list-item')).toBeInTheDocument()
    for (const bar of barsOf(stay)) expect(bar).not.toHaveAttribute('aria-current')
  })

  it('a bar in the grid opens the detail in the panel', async () => {
    const user = renderPage()
    const panel = await findPanel()

    await user.click(barsOf(stay)[0])

    await waitFor(() => expect(within(panel).getByTestId('reservation-detail-card')).toBeInTheDocument())
    expect(calendarHeading()).toBeInTheDocument()
  })
})

// #504: a tapped bar must always lead to a visible detail.
describe('reservations page: detail is reachable from the grid', () => {
  const scrollIntoView = vi.fn()
  beforeEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView
  })
  afterEach(() => {
    scrollIntoView.mockReset()
    // @ts-expect-error jsdom has no scrollIntoView; restore its absence
    delete Element.prototype.scrollIntoView
    vi.unstubAllGlobals()
  })

  it('on mobile a bar tap scrolls the page to the detail panel', async () => {
    const user = renderPage()
    const panel = await findPanel()

    await user.click(barsOf(stay)[0])

    await waitFor(() => expect(within(panel).getByTestId('reservation-detail-card')).toBeInTheDocument())
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(panel).toContainElement(scrollIntoView.mock.contexts.at(-1) as HTMLElement)

    // Scrolled back up, the same stay tapped again: the page has to move again.
    await user.click(barsOf(stay)[1])
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('on a wide desktop the detail is already beside the calendar, so the page does not jump', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const user = renderPage()
    const panel = await findPanel()

    await user.click(barsOf(stay)[0])

    await waitFor(() => expect(within(panel).getByTestId('reservation-detail-card')).toBeInTheDocument())
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('a bar of a stay that already ended opens its detail; the past day itself does not start a selection', async () => {
    vi.setSystemTime(new Date(2030, 5, 20))
    const user = renderPage()
    const panel = await findPanel()

    await user.click(document.querySelector(`[data-date="${ym}-15"]`) as HTMLElement)
    expect(screen.queryByTestId('calendar-selection-chip')).toBeNull()

    await user.click(barsOf(stay)[0])

    await waitFor(() => expect(within(panel).getByTestId('reservation-detail-card')).toBeInTheDocument())
  })
})

// #506: a free day and a picked range say what was picked.
describe('reservations page: picking days', () => {
  const day = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement

  it('a free day says it is free and offers booking from that day, even when the month has stays', async () => {
    const user = renderPage()
    const panel = await findPanel()

    await user.click(day(`${ym}-20`))

    expect(within(panel).getByText('20. 6. je volno.')).toBeInTheDocument()
    expect(within(panel).queryByText(/V tomto měsíci nejsou/)).toBeNull()

    await user.click(within(panel).getByRole('button', { name: 'Zarezervovat od 20. 6.' }))

    const dialog = await screen.findByRole('dialog', { name: 'Nová rezervace' })
    expect(within(dialog).getByLabelText('Příjezd')).toHaveValue(`${ym}-20`)
  })

  it('the day filter applies even when the "Nadcházející" tab was open', async () => {
    const user = renderPage()
    const panel = await findPanel()

    await user.click(within(panel).getByRole('button', { name: 'Nadcházející' }))
    await user.click(day(`${ym}-20`))

    expect(within(panel).getByText('20. 6. je volno.')).toBeInTheDocument()
    expect(within(panel).queryByTestId('reservation-list-item')).toBeNull()
  })

  it('a day with a stay still lists the stay', async () => {
    const user = renderPage()
    const panel = await findPanel()

    await user.click(day(`${ym}-11`))

    expect(within(panel).getByTestId('reservation-list-item')).toBeInTheDocument()
    expect(within(panel).queryByText(/je volno/)).toBeNull()
  })

  it('the "Vybraný termín" dialog shows the picked range and the number of nights', async () => {
    const user = renderPage()
    await findPanel()

    await user.click(day(`${ym}-20`))
    await user.click(day(`${ym}-20`))
    await user.click(day(`${ym}-22`))

    const dialog = await screen.findByRole('dialog', { name: 'Vybraný termín' })
    expect(within(dialog).getByText('20.–22. 6. · 2 noci')).toBeInTheDocument()
  })
})
