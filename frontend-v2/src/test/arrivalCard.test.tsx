import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { Toast } from '@/components/shared/Toast'
import type { AttentionItem, DashboardReservationsData } from '@/api/dashboard'
import type { HandoverOverview } from '@/api/handover'

// Příjezdová karta „přivítání“ (#174, mock 03-prijezd). Fiktivní API, žádná reálná data chaty.
const { responses } = vi.hoisted(() => ({ responses: new Map<string, unknown>() }))
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn((url: string) =>
      responses.has(url) ? Promise.resolve({ data: responses.get(url) }) : new Promise<never>(() => {}),
    ),
    put: vi.fn(() => new Promise<never>(() => {})),
    post: vi.fn(() => new Promise<never>(() => {})),
    delete: vi.fn(() => new Promise<never>(() => {})),
    patch: vi.fn(() => new Promise<never>(() => {})),
  },
}))
vi.mock('@/api/dashboard', () => ({ fetchWeather: vi.fn(() => Promise.resolve(null)) }))
const { auth } = vi.hoisted(() => ({ auth: { isGuest: false } }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-eva', cabinId: 'c-1', username: 'Eva' }, isAdmin: false, isGuest: auth.isGuest }),
}))

const TODAY = '2026-12-10'
const TOMORROW = '2026-12-11'

const RESERVATIONS: DashboardReservationsData = {
  activeReservation: null,
  upcomingReservations: [],
  myNextReservation: null,
  departingToday: false,
  departingReservationId: null,
  nextFreeWeekend: null,
  lastStay: null,
  stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
}

const JANA_HANDOVER: NonNullable<HandoverOverview['lastHandover']> = {
  reservationId: 'r-jana',
  from: '2026-12-05',
  to: '2026-12-08',
  organizer: { username: 'Jana', userColor: null, userAnimalIcon: null },
  completedByUsername: 'Jana',
  completedAt: '2026-12-08T09:30:00.000Z',
  checkoutState: { gas: 'half', heatingOff: true, waterOff: false, broken: 'Kape kohoutek v koupelně.', note: 'Užijte si to, dřevo je u kamen.' },
}

function myStay(from: string, to = '2026-12-14'): HandoverOverview['myStay'] {
  return { reservationId: 'r-eva', from, to, phase: from === TODAY ? 'ongoing' : 'upcoming', isCheckoutCompleted: false }
}

function renderOverview(handover: HandoverOverview, attention: AttentionItem[] = [], prefs: Record<string, boolean> = {}, reservations = RESERVATIONS) {
  responses.set('/users/me', { dashboardPrefs: prefs })
  responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [] })
  responses.set('/dashboard/reservations', reservations)
  responses.set('/dashboard/shopping', { pendingShoppingItems: [], totalPendingShoppingCount: 0, totalItemsCount: 0, essentialWarning: null, attention })
  responses.set('/dashboard/notes', { latestNotes: [], pinnedHandoverNote: null, handoverNoteAuthor: null, handoverNoteUpdatedAt: null })
  responses.set('/handover', handover)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
        <Toast />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const arrivalCard = () => screen.findByRole('region', { name: 'Vítej na chatě' })
/** Přehled je načtený a dotaz na Předávku doběhl (macrotask po vykreslení). */
async function overviewSettled() {
  await screen.findByRole('region', { name: 'Chata zatím čeká' })
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`))
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  responses.clear()
  auth.isGuest = false
})

describe('Příjezdová karta (#174)', () => {
  it('v den příjezdu je nahoře na Přehledu: vzkaz jako citace pod uvítáním, pod ním read-only zrcadlo předávky', async () => {
    renderOverview({ myStay: myStay(TODAY), lastHandover: JANA_HANDOVER })

    const card = await arrivalCard()
    expect(card).toHaveTextContent('Dnes přijíždíš · tvůj pobyt 10.–14. 12.')
    const quote = within(card).getByRole('figure')
    expect(quote).toHaveTextContent('„Užijte si to, dřevo je u kamen.“')
    expect(quote).toHaveTextContent('Jana')
    const mirror = within(card).getByRole('region', { name: 'Od minule · Jana' })
    expect(mirror).toHaveTextContent('Plynová bomba')
    expect(mirror).toHaveTextContent('Dostatek')
    expect(mirror).toHaveTextContent('Topení vypnuté')
    expect(mirror).toHaveTextContent('Voda otevřená')
    expect(mirror).toHaveTextContent('Kape kohoutek v koupelně.')
    // Vzkaz je jen jednou, jako citace nahoře; zrcadlo nejde upravit
    expect(card.textContent?.match(/dřevo je u kamen/g)).toHaveLength(1)
    expect(quote.compareDocumentPosition(mirror) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(mirror).queryAllByRole('button')).toHaveLength(0)
    expect(within(mirror).queryAllByRole('textbox')).toHaveLength(0)
    // Hero je nad ostatními kartami Přehledu
    const headings = within(screen.getByTestId('dashboard-page')).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings[0]).toBe('Vítej na chatě')
  })

  it('den před příjezdem karta už je, ale příjezd potvrdit nejde', async () => {
    renderOverview({ myStay: myStay(TOMORROW), lastHandover: JANA_HANDOVER })

    const card = await arrivalCard()
    expect(card).toHaveTextContent('Zítra přijíždíš · tvůj pobyt 11.–14. 12.')
    expect(within(card).getByRole('region', { name: 'Od minule · Jana' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Potvrdit příjezd' })).not.toBeInTheDocument()
  })

  it('„Potvrdit příjezd“ kartu stáhne, potvrdí toastem a po znovuotevření Přehledu se nevrátí', async () => {
    renderOverview({ myStay: myStay(TODAY), lastHandover: JANA_HANDOVER })

    fireEvent.click(within(await arrivalCard()).getByRole('button', { name: 'Potvrdit příjezd' }))
    expect(screen.queryByRole('region', { name: 'Vítej na chatě' })).not.toBeInTheDocument()
    expect(await screen.findByText('Příjezd potvrzen.')).toBeInTheDocument()

    cleanup()
    renderOverview({ myStay: myStay(TODAY), lastHandover: JANA_HANDOVER })
    await overviewSettled()
    expect(screen.queryByRole('region', { name: 'Vítej na chatě' })).not.toBeInTheDocument()
  })

  it('co dochází ukáže s odkazem do Zásob, když nic nedochází, blok není', async () => {
    renderOverview({ myStay: myStay(TODAY), lastHandover: JANA_HANDOVER }, [
      { name: 'Káva', isEmpty: false, isEssential: true, inventoryId: 'inv-k', shoppingItemId: null },
      { name: 'Toaleťák', isEmpty: true, isEssential: false, inventoryId: 'inv-t', shoppingItemId: null },
    ])
    const card = await arrivalCard()
    const supplies = within(card).getByRole('heading', { name: 'Co dochází' }).parentElement as HTMLElement
    expect(supplies).toHaveTextContent('Káva, Toaleťák')
    expect(within(supplies).getByRole('link', { name: 'Otevřít Zásoby' })).toHaveAttribute('href', '/shopping?view=pantry')

    cleanup()
    renderOverview({ myStay: myStay(TODAY), lastHandover: JANA_HANDOVER })
    expect(within(await arrivalCard()).queryByRole('heading', { name: 'Co dochází' })).not.toBeInTheDocument()
  })

  it('první pobyt bez předávky: karta to řekne, nic si nevymýšlí', async () => {
    renderOverview({ myStay: myStay(TODAY), lastHandover: null })

    const card = await arrivalCard()
    expect(card).toHaveTextContent('Od minule tu žádná předávka není.')
    expect(within(card).queryByRole('figure')).not.toBeInTheDocument()
    expect(within(card).queryByRole('region', { name: /^Od minule/ })).not.toBeInTheDocument()
  })

  it('předávka bez vzkazu: citace není, zrcadlo ano', async () => {
    renderOverview({ myStay: myStay(TODAY), lastHandover: { ...JANA_HANDOVER, checkoutState: { gas: 'low' } } })

    const card = await arrivalCard()
    expect(within(card).queryByRole('figure')).not.toBeInTheDocument()
    expect(within(card).getByRole('region', { name: 'Od minule · Jana' })).toHaveTextContent('Dochází')
  })

  it.each([
    ['pobyt začíná až pozítří', { myStay: myStay('2026-12-12'), lastHandover: JANA_HANDOVER }],
    ['pobyt už běží od včera', { myStay: { ...myStay('2026-12-09')!, phase: 'ongoing' as const }, lastHandover: JANA_HANDOVER }],
    ['žádný můj pobyt', { myStay: null, lastHandover: JANA_HANDOVER }],
  ])('karta se neukáže, když %s', async (_case, handover) => {
    renderOverview(handover)
    await overviewSettled()
    expect(screen.queryByRole('region', { name: 'Vítej na chatě' })).not.toBeInTheDocument()
  })

  it('host kartu nemá a Předávku nenačítá (dostal by 403)', async () => {
    auth.isGuest = true
    const { default: apiClient } = await import('@/api/client')
    vi.mocked(apiClient.get).mockClear()
    renderOverview({ myStay: myStay(TODAY), lastHandover: JANA_HANDOVER })
    await overviewSettled()
    expect(screen.queryByRole('region', { name: 'Vítej na chatě' })).not.toBeInTheDocument()
    expect(vi.mocked(apiClient.get).mock.calls.map(([url]) => url)).not.toContain('/handover')
  })

  it('zapnutý blok „Od minule“ se vedle karty neopakuje', async () => {
    // Poslední pobyt Jany s předávkou, na chatě teď nikdo: bez příjezdové karty by se blok ukázal
    const withLastStay: DashboardReservationsData = {
      ...RESERVATIONS,
      lastStay: { username: 'Jana', userColor: null, userAnimalIcon: null, from: '2026-12-05', to: '2026-12-08', daysEmpty: 2, isCheckoutCompleted: true, checkoutState: { heatingOff: true } },
    }
    renderOverview({ myStay: myStay('2026-12-12'), lastHandover: JANA_HANDOVER }, [], { sinceLast: true }, withLastStay)
    expect(await screen.findByTestId('dashboard-since-last-widget')).toBeInTheDocument()

    cleanup()
    renderOverview({ myStay: myStay(TOMORROW), lastHandover: JANA_HANDOVER }, [], { sinceLast: true }, withLastStay)
    await arrivalCard()
    expect(screen.queryByTestId('dashboard-since-last-widget')).not.toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: /^Od minule/ })).toHaveLength(1)
  })

  it('na desktopu je hero v hlavním sloupci nahoře, ne v bočním panelu', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1024px)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      renderOverview({ myStay: myStay(TODAY), lastHandover: JANA_HANDOVER }, [], { noticeboard: true })
      const card = await arrivalCard()
      expect(await screen.findByRole('complementary', { name: 'Kontext chaty' })).not.toContainElement(card)
      const headings = within(screen.getByTestId('dashboard-page')).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
      expect(headings[0]).toBe('Vítej na chatě')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
