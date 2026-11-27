import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HandoverPage } from '@/features/handover/HandoverPage'
import { RESERVATIONS_KEY } from '@/features/reservations/hooks/useReservations'

// Tab Předávka (#216) s podvrženým API a fiktivními daty.
const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }))
vi.mock('@/api/client', () => ({ default: { get, patch } }))
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
    expect(screen.getByRole('status', { name: 'Načítám předávku' })).toBeInTheDocument()
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

  it('v den odjezdu po dokončené předávce řekne „Chata předána“', async () => {
    respond({ myStay: { ...UPCOMING, phase: 'departure', isCheckoutCompleted: true }, lastHandover: null })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Chata předána' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Předat chatu v Kalendáři' })).not.toBeInTheDocument()
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

// Formulář a předání (#218): GET podle URL, PATCH /checkout podvržený.
const DEPARTURE = { ...UPCOMING, phase: 'departure' }
const SAVED = { isCheckoutCompleted: true, checkoutCompletedByUsername: 'Jana', checkoutCompletedAt: '2027-07-22T08:40:00Z',
  checkoutState: { gas: 'half', heatingOff: false, waterOff: true, note: 'Klíč je u souseda.' } }
function routes(myStay: unknown, extra: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { '/handover': { myStay, lastHandover: LAST }, '/cabin': { departureChecklist: null }, ...extra }
  get.mockImplementation((url: string) => Promise.resolve({ data: data[url] }))
}
const field = (name: RegExp) => screen.getByRole('textbox', { name })
const submit = async () => userEvent.click(await screen.findByRole('button', { name: 'Předat chatu' }))
const expectPatch = (checkoutState: unknown) => expect(patch).toHaveBeenCalledWith('/reservations/r-mine/checkout', { checkoutState })

describe('HandoverPage: předat chatu', () => {
  beforeEach(() => { get.mockReset(); patch.mockReset() })

  it('ve fázi departure pošle jeden PATCH s celým stavem, během ukládání nejde odeslat znovu, pak ukáže shrnutí', async () => {
    routes(DEPARTURE)
    let resolve!: (v: unknown) => void
    patch.mockReturnValue(new Promise((r) => { resolve = r }))
    renderPage()
    const gas = await screen.findByRole('radiogroup', { name: 'Plynová bomba' })
    expect(within(gas).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Dostatek', 'Dochází', 'Došlo'])
    expect(screen.queryByText(/Od minule|Než odjedeš/)).not.toBeInTheDocument()
    await userEvent.click(within(gas).getByRole('radio', { name: 'Dochází' }))
    expect(within(gas).getByRole('radio', { name: 'Dochází' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('switch', { name: 'Voda uzavřená' }))
    await userEvent.type(field(/Rozbité/), '  Kape kohoutek  ')
    await userEvent.type(field(/Vzkaz pro dalšího/), 'Užijte si to')
    await submit()
    const saving = screen.getByRole('button', { name: 'Ukládám…' })
    expect(saving).toBeDisabled()
    await userEvent.click(saving)
    expect(patch).toHaveBeenCalledTimes(1)
    expectPatch({ gas: 'low', heatingOff: false, waterOff: true, broken: 'Kape kohoutek', note: 'Užijte si to' })
    await act(async () => resolve({ data: { ...SAVED, checkoutState: { gas: 'low', waterOff: true } } }))
    const done = await screen.findByRole('region', { name: 'Chata předána' })
    expect(done).toHaveTextContent('Předal/a Jana · 22. 7. 2027 v 10:40')
    expect(done).toHaveTextContent('Dochází')
  })

  it('úprava předvyplní uložený stav (half jako Dostatek) a uložení ho přepíše', async () => {
    routes({ ...DEPARTURE, isCheckoutCompleted: true }, { '/reservations/r-mine/checkout': SAVED })
    patch.mockResolvedValue({ data: SAVED })
    renderPage()
    const done = await screen.findByRole('region', { name: 'Chata předána' })
    expect(done).toHaveTextContent('Topení zapnuté')
    await userEvent.click(within(done).getByRole('button', { name: 'Upravit předávku' }))
    expect(screen.getByRole('radio', { name: 'Dostatek' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Voda uzavřená' })).toBeChecked()
    await userEvent.clear(field(/Vzkaz pro dalšího/))
    await submit()
    expectPatch({ gas: 'full', heatingOff: false, waterOff: true })
    expect(await screen.findByRole('region', { name: 'Chata předána' })).toBeInTheDocument()
  })

  it('mimo okno předávky je shrnutí jen ke čtení', async () => {
    routes({ ...UPCOMING, phase: 'ongoing', isCheckoutCompleted: true }, { '/reservations/r-mine/checkout': SAVED })
    renderPage()
    expect(await screen.findByRole('region', { name: 'Chata předána' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upravit předávku' })).not.toBeInTheDocument()
  })

  it('ve fázi ongoing čeká a „Odjíždím dřív – předat teď“ otevře formulář', async () => {
    routes({ ...UPCOMING, phase: 'ongoing' })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Odjíždím dřív – předat teď' }))
    expect(screen.getByRole('radiogroup', { name: 'Plynová bomba' })).toBeInTheDocument()
  })

  it('request v offline frontě ukáže „Čeká na připojení“, ne „Chata předána“', async () => {
    routes(DEPARTURE)
    patch.mockRejectedValue(Object.assign(new Error('Network Error'), { queuedOffline: true }))
    renderPage()
    await submit()
    expect(await screen.findByRole('status')).toHaveTextContent('Čeká na připojení')
    expect(screen.queryByText('Chata předána')).not.toBeInTheDocument()
  })

  it('při chybě serveru zůstanou data ve formuláři a ukáže se hláška', async () => {
    routes(DEPARTURE)
    patch.mockRejectedValue(Object.assign(new Error('Server'), { isAxiosError: true, response: { status: 500 } }))
    renderPage()
    await userEvent.type(await screen.findByRole('textbox', { name: /Co nechávám/ }), 'Dřevo')
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Předávku se nepodařilo uložit.')
    expect(field(/Co nechávám/)).toHaveValue('Dřevo')
  })

  it('nastavený odjezdový checklist je nepovinná připomínka a neblokuje předání', async () => {
    routes(DEPARTURE, { '/cabin': { departureChecklist: ['Zamknout okenice', 'Vynést koš'] } })
    patch.mockResolvedValue({ data: SAVED })
    renderPage()
    expect(within(await screen.findByRole('region', { name: 'Než odjedeš' })).getAllByRole('checkbox')).toHaveLength(2)
    await submit()
    expectPatch({ heatingOff: false, waterOff: false })
  })
})
