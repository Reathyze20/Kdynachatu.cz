import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HandoverPage } from '@/features/handover/HandoverPage'
import { RESERVATIONS_KEY } from '@/features/reservations/hooks/useReservations'

// Tab Předávka (#216) s podvrženým API a fiktivními daty.
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ default: { get } }))
vi.mock('@/lib/errorReporting', () => ({ reportError: vi.fn() }))

const LAST = {
  reservationId: 'r-old', from: '2027-07-10', to: '2027-07-12',
  organizer: { username: 'Novákovi', userColor: null, userAnimalIcon: null },
  completedByUsername: 'Jana', completedAt: '2027-07-12T08:40:00Z',
  checkoutState: { gas: 'half', heatingOff: true, broken: 'Kape kohoutek', note: 'Dřevo je u kamen.' },
}
const UPCOMING = { reservationId: 'r-mine', from: '2027-07-20', to: '2027-07-22', phase: 'upcoming', isCheckoutCompleted: false }

function renderPage(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><HandoverPage /></MemoryRouter>
    </QueryClientProvider>,
  )
  return qc
}

const respond = (data: unknown) => get.mockResolvedValue({ data })

describe('HandoverPage: tab Předávka mimo den odjezdu', () => {
  beforeEach(() => { get.mockReset() })

  it('ukazuje skeleton a čte GET /handover', () => {
    get.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByLabelText('Načítám předávku')).toHaveAttribute('aria-busy', 'true')
    expect(get).toHaveBeenCalledWith('/handover')
  })

  it('zrcadlí poslední předávku slovníkem plynu a ukáže kartu mého pobytu', async () => {
    respond({ myStay: UPCOMING, lastHandover: LAST })
    renderPage()

    const mirror = await screen.findByRole('region', { name: 'Od minule · Jana' })
    expect(mirror).toHaveTextContent('Pobyt 10.–12. 7. · předáno 12. 7. 2027 v 10:40')
    expect(within(mirror).getByText('Dostatek')).toBeInTheDocument()
    expect(mirror).toHaveTextContent('Topení vypnuté')
    expect(mirror).not.toHaveTextContent(/Voda|Nechal/)
    expect(mirror).toHaveTextContent('Potřebuje pozornost: Kape kohoutek')
    expect(within(mirror).getByText('„Dřevo je u kamen.“')).toBeInTheDocument()

    const mine = screen.getByRole('region', { name: 'Tvoje předávka' })
    expect(mine).toHaveTextContent('Otevře se, až budeš odjíždět.')
    expect(mine).toHaveTextContent('Tvůj pobyt 20.–22. 7.')
  })

  it('bez poslední předávky nemá kartu „Od minule“, bez pobytu odkáže do Kalendáře', async () => {
    respond({ myStay: null, lastHandover: null })
    renderPage()

    expect(await screen.findByRole('link', { name: 'Otevřít Kalendář' })).toHaveAttribute('href', '/reservations')
    expect(screen.queryByText(/Od minule/)).not.toBeInTheDocument()
  })

  it('v den odjezdu dočasně vede do Kalendáře, kde je zatím formulář', async () => {
    respond({ myStay: { ...UPCOMING, phase: 'departure' }, lastHandover: null })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Dnes odjíždíš' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Předat chatu v Kalendáři' })).toHaveAttribute('href', '/reservations')
  })

  it('po chybě nabídne „Zkusit znovu“ a znovu načte', async () => {
    respond({ myStay: UPCOMING, lastHandover: null })
    get.mockRejectedValueOnce(new Error('Network Error'))
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Zkusit znovu' }))
    expect(await screen.findByRole('region', { name: 'Tvoje předávka' })).toBeInTheDocument()
  })

  it('obnoví se sama po invalidaci RESERVATIONS_KEY (reservation:updated)', async () => {
    respond({ myStay: UPCOMING, lastHandover: null })
    const qc = renderPage()
    await screen.findByRole('region', { name: 'Tvoje předávka' })

    respond({ myStay: UPCOMING, lastHandover: LAST })
    await act(() => qc.invalidateQueries({ queryKey: RESERVATIONS_KEY }))
    expect(await screen.findByRole('region', { name: 'Od minule · Jana' })).toBeInTheDocument()
  })
})
