import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { CabinToday } from '@/features/dashboard/CabinToday'
import { SidebarToday } from '@/features/dashboard/SidebarToday'
import { DesktopSidebar } from '@/components/layout/DesktopSidebar'
import { Toast } from '@/components/shared/Toast'
import apiClient from '@/api/client'
import type { InternalAxiosRequestConfig } from 'axios'
import { checkoutPath } from '@/api/reservations'
import { enqueueMutation } from '@/lib/offlineQueue'
import type { AttentionItem, CabinSettings, DashboardReservationsData, DashboardShoppingData, UpcomingReservation } from '@/api/dashboard'

// Fiktivní API Přehledu (redesign #172). Žádná reálná data chaty.
const { responses, weather } = vi.hoisted(() => ({ responses: new Map<string, unknown>(), weather: { current: null as unknown } }))
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
vi.mock('@/api/dashboard', () => ({ fetchWeather: vi.fn(() => Promise.resolve(weather.current)) }))
const { auth } = vi.hoisted(() => ({ auth: { isAdmin: false, isGuest: false } }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-eva', cabinId: 'c-1', username: 'Eva' }, isAdmin: auth.isAdmin, isGuest: auth.isGuest }),
}))

const TODAY = '2026-12-10'

function upcoming(id: string, username: string, from: string, to: string, status = 'primary'): UpcomingReservation {
  return { id, userId: `u-${username}`, username, userColor: null, userAnimalIcon: null, from, to, purpose: 'Víkend', status }
}

function reservations(overrides: Partial<DashboardReservationsData> = {}): DashboardReservationsData {
  return {
    activeReservation: null,
    upcomingReservations: [],
    myNextReservation: null,
    departingToday: false,
    departingReservationId: null,
    nextFreeWeekend: null,
    lastStay: null,
    stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
    ...overrides,
  }
}

const NO_SHOPPING: DashboardShoppingData = { pendingShoppingItems: [], totalPendingShoppingCount: 0, totalItemsCount: 0, essentialWarning: null }

// #685 (spec #677): volitelné bloky jsou ve výchozím stavu vypnuté. Testy z doby před #685 počítají se všemi
// zapnutými; výchozí minimum a přepínání hlídá describe #685, který si preference nastaví sám.
const ALL_BLOCKS = { cabinScene: true, sinceLast: true, laterAndFree: true, stayForecast: true, regionEvents: true, noticeboard: true }

function renderOverview(data: DashboardReservationsData, shopping: DashboardShoppingData = NO_SHOPPING, cabin: Partial<CabinSettings> = {}) {
  if (!responses.has('/users/me')) responses.set('/users/me', { dashboardPrefs: ALL_BLOCKS })
  responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [], ...cabin })
  responses.set('/dashboard/reservations', data)
  responses.set('/dashboard/shopping', shopping)
  if (!responses.has('/dashboard/notes')) responses.set('/dashboard/notes', { latestNotes: [], pinnedHandoverNote: null, handoverNoteAuthor: null, handoverNoteUpdatedAt: null })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return qc
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`))
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  responses.clear()
  weather.current = null
  auth.isAdmin = false
  auth.isGuest = false
})

const NOVAKOVI_NOW = {
  id: 'r-now', username: 'Novákovi', userColor: null, userAnimalIcon: null,
  from: '2026-12-08', to: '2026-12-12', purpose: 'Víkend', handoverNote: null, isCheckoutCompleted: false,
}

describe('Přehled: hlavička teď → příště (#272)', () => {
  // #366: hlavička je osa teď → příště; účel a spolucestující z ní zmizely (změna zadání #272).
  // Spec #677 (#273): sloupec „pak“ z karty zmizel, další pobyty nese blok „Potom a volno“.
  it('teď a příště jsou sloupce v jedné kartě s avatarem, jménem a jedním řádkem „kdy“', async () => {
    renderOverview(reservations({
      activeReservation: NOVAKOVI_NOW,
      upcomingReservations: [
        { ...upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-17'), purpose: 'Řezání dřeva', participants: [{ userId: 'u-petr', username: 'Petr', userColor: null, userAnimalIcon: null }] },
        upcoming('r-backup', 'Petr', '2026-12-20', '2026-12-22', 'backup'),
        upcoming('r-eva', 'Eva', '2026-12-28', '2026-12-30'),
      ],
      myNextReservation: { from: '2026-12-28', to: '2026-12-30', purpose: 'Víkend' },
    }))

    const header = await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(screen.getByTestId('dashboard-reservation-widget')).toContainElement(header)
    const now = within(header).getByRole('group', { name: 'Teď' })
    const next = within(header).getByRole('group', { name: 'Příště' })
    expect(now).toHaveTextContent(/Novákovi\s*do so 12\. 12\./)
    expect(within(now).getByText('N')).toBeInTheDocument()
    expect(next).toHaveTextContent(/Jana\s*od po 14\. 12\./)
    expect(within(next).getByText('J')).toBeInTheDocument()
    expect(next).toHaveTextContent('od po 14. 12. · 3 noci')
    expect(header).not.toHaveTextContent('Řezání dřeva')
    expect(within(header).queryAllByTitle('Petr')).toHaveLength(0)
    // Jméno a datum dalšího pobytu jsou jen v hlavičce (upřesnění 1), karta „Další příjezd“ zanikla.
    expect(within(header).queryByRole('group', { name: 'Pak' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Řetězec turnusu' })).not.toBeInTheDocument()
    expect(document.body.textContent?.match(/14\. 12\./g)).toHaveLength(1)
    // Můj pobyt za „příště“ už v kartě jako „pak“ není, ukáže ho řádek „Tvůj pobyt“ (#677)
    expect(header).toHaveTextContent('Tvůj pobyt za 18 dní')
    expect(screen.queryByRole('region', { name: 'Další příjezd' })).not.toBeInTheDocument()
  })

  it('vlastní pobyt je „Ty“, odjezd a příjezd dnes jsou „do dneška“ a „od dneška“', async () => {
    renderOverview(reservations({
      activeReservation: { ...NOVAKOVI_NOW, username: 'Eva', to: TODAY },
      upcomingReservations: [upcoming('r-jana', 'Jana', TODAY, '2026-12-13')],
    }))

    const header = await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(within(header).getByRole('group', { name: 'Teď' })).toHaveTextContent(/Ty\s*do dneška/)
    expect(within(header).getByRole('group', { name: 'Příště' })).toHaveTextContent(/Jana\s*od dneška/)
  })

  it('když na chatě nikdo není, je vlevo „Chata je volná“ a vpravo příště', async () => {
    renderOverview(reservations({ upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-28', '2026-12-30')] }))

    const header = await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(within(header).getByRole('group', { name: 'Teď' })).toHaveTextContent('Chata je volná')
    expect(within(header).getByRole('group', { name: 'Příště' })).toHaveTextContent(/Jana\s*od po 28\. 12\./)
    expect(within(header).queryByRole('group', { name: 'Pak' })).not.toBeInTheDocument()
  })

  it('volná chata ukáže pod sebou, jak dlouho je prázdná; „Checklist OK“ zmizí, nevyplněný checklist zůstane', async () => {
    const lastStay = { username: 'Jana', userColor: null, userAnimalIcon: null, from: '2026-11-30', to: '2026-12-02', daysEmpty: 8 }
    const next = [upcoming('r-petr', 'Petr', '2026-12-28', '2026-12-30')]
    renderOverview(reservations({ upcomingReservations: next, lastStay: { ...lastStay, isCheckoutCompleted: true } }))

    let header = await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(within(header).getByRole('group', { name: 'Teď' })).toHaveTextContent(/Chata je volná\s*prázdná 8 dní$/)
    expect(header).not.toHaveTextContent(/Checklist/i)

    cleanup()
    renderOverview(reservations({ upcomingReservations: next, lastStay: { ...lastStay, isCheckoutCompleted: false } }))
    header = await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(within(header).getByRole('group', { name: 'Teď' })).toHaveTextContent('prázdná 8 dní · checklist nevyplněn')
  })

  it('„Od minule“ odděluje stav chaty od vzkazů; popisky vzkazů jsou pro čtečky', async () => {
    renderOverview(reservations({
      upcomingReservations: [upcoming('r-petr', 'Petr', '2026-12-28', '2026-12-30')],
      lastStay: {
        username: 'Jana', userColor: null, userAnimalIcon: null, from: '2026-11-30', to: '2026-12-02', daysEmpty: 8, isCheckoutCompleted: true,
        checkoutState: { gas: 'low', heatingOff: true, waterOff: true, broken: 'Kape kohoutek.', leftBehind: 'Dřevo u kamen.', note: 'Past na myši.' },
      },
    }))

    // #685 (spec #677): „Od minule“ je samostatný blok, ne část karty „Na chatě teď“
    const sinceLast = await screen.findByRole('region', { name: 'Od minule — Jana' })
    const items = (name: string) => within(within(sinceLast).getByRole('list', { name })).getAllByRole('listitem').map((li) => li.textContent)
    expect(items('Stav chaty')).toEqual(['Plynová bomba: Dochází', 'Topení vypnuté', 'Voda uzavřená'])
    expect(items('Vzkazy')).toEqual(['Rozbité: Kape kohoutek.', 'Nechal/a: Dřevo u kamen.', 'Poznámka: Past na myši.'])
  })

  it('když po aktuálním pobytu nic není, vpravo je „Zatím nikdo“', async () => {
    renderOverview(reservations({ activeReservation: NOVAKOVI_NOW }))

    const header = await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(within(header).getByRole('group', { name: 'Příště' })).toHaveTextContent('Zatím nikdo')
    expect(within(header).queryByRole('group', { name: 'Pak' })).not.toBeInTheDocument()
  })

  // Spec #677 (#273): „pak/+N“ a „Volný víkend“ z karty zmizely, obojí nese blok „Potom a volno“.
  it('karta nemá sloupec „Pak“, počet dalších pobytů ani „Volný víkend“', async () => {
    renderOverview(reservations({
      upcomingReservations: ['14', '16', '18', '20', '22'].map((day, i) => upcoming(`r-${i}`, `Host${i}`, `2026-12-${day}`, `2026-12-${Number(day) + 1}`)),
      nextFreeWeekend: { start: '2026-12-26', end: '2026-12-27' },
    }))

    const header = await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(within(header).queryByRole('group', { name: 'Pak' })).not.toBeInTheDocument()
    expect(header).not.toHaveTextContent(/Host1|\+\d|a víc|Volný víkend/)
    expect(within(header).getByRole('button', { name: 'Kalendář' })).toBeInTheDocument()
  })

  it('když není nic naplánováno, zůstane prázdný stav Přehledu bez hlavičky', async () => {
    renderOverview(reservations())

    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByRole('region', { name: 'Na chatě teď' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Pak' })).not.toBeInTheDocument()
  })

  it('můj pevný pobyt, který není v hlavičce ani v řetězci, ukáže karta zvlášť', async () => {
    renderOverview(reservations({
      upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-16'), upcoming('r-petr', 'Petr', '2026-12-20', '2026-12-22'), upcoming('r-eva', 'Eva', '2026-12-28', '2026-12-30')],
      myNextReservation: { from: '2026-12-28', to: '2026-12-30', purpose: 'Víkend' },
    }))

    expect(await screen.findByRole('region', { name: 'Na chatě teď' })).toHaveTextContent('Tvůj pobyt za 18 dní')
  })

  it('můj záložní pobyt se jako příjezd neukáže, počítají se jen pevné', async () => {
    renderOverview(reservations({
      upcomingReservations: [upcoming('r-eva', 'Eva', '2026-12-14', '2026-12-16', 'backup')],
      myNextReservation: { from: '2026-12-14', to: '2026-12-16', purpose: 'Víkend' },
    }))

    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByText(/Tvůj pobyt/)).not.toBeInTheDocument()
  })
})

// #273 (spec #677): pobyty po „příště“ a volno k zabrání; do #685 se blok ukazuje všem členům pod kartou Kdo jede.
describe('Přehled: „Potom a volno“ (#273)', () => {
  const stay = (id: string, username: string, from: string, to: string, status: 'primary' | 'soft' | 'backup' = 'primary') =>
    ({ id, userId: `u-${username}`, username, from, to, purpose: 'Víkend', status })
  const calendar = (...stays: ReturnType<typeof stay>[]) => responses.set('/reservations', { reservations: stays, availabilities: [] })
  const JANA = stay('r-jana', 'Jana', '2026-12-14', '2026-12-16')

  it('ukáže pobyty po „příště“ a mezi nimi volno; „Zabrat“ vede na formulář s od–do', async () => {
    calendar(JANA, stay('r-ida', 'Ida', '2026-12-19', '2026-12-20', 'soft'), stay('r-eva', 'Eva', '2026-12-28', '2026-12-30', 'soft'))
    renderOverview(reservations({ upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-16')] }))

    const block = await screen.findByRole('region', { name: 'Potom a volno' })
    const rows = within(block).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual([
      expect.stringMatching(/^Volno · 1 noc\s*17\.–18\. 12\.\s*Zabrat$/),
      expect.stringMatching(/Ida\s*19\.–20\. 12\. · 1 noc · předběžně/),
      expect.stringMatching(/^Volno · 6 nocí\s*21\.–27\. 12\./),
      expect.stringMatching(/Ty\s*28\.–30\. 12\. · 2 noci · předběžně/),
    ])
    expect(block).not.toHaveTextContent('Jana')
    expect(within(block).getByRole('link', { name: 'Zabrat 17.–18. 12.' })).toHaveAttribute('href', '/reservations?from=2026-12-17&to=2026-12-18')
    expect(within(block).getByRole('link', { name: 'Celý kalendář' })).toHaveAttribute('href', '/reservations')
  })

  it('můj pobyt, který karta ukazuje jako „Tvůj pobyt“, se v bloku neopakuje', async () => {
    calendar(JANA, stay('r-eva', 'Eva', '2026-12-20', '2026-12-22'), stay('r-petr', 'Petr', '2026-12-28', '2026-12-30'))
    renderOverview(reservations({
      upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-16'), upcoming('r-eva', 'Eva', '2026-12-20', '2026-12-22'), upcoming('r-petr', 'Petr', '2026-12-28', '2026-12-30')],
      myNextReservation: { from: '2026-12-20', to: '2026-12-22', purpose: 'Víkend' },
    }))

    expect(await screen.findByRole('region', { name: 'Na chatě teď' })).toHaveTextContent('Tvůj pobyt za 10 dní')
    const block = await screen.findByRole('region', { name: 'Potom a volno' })
    expect(block).not.toHaveTextContent(/Ty|20\.–22\. 12\./)
    expect(block).toHaveTextContent('Petr')
  })

  it('bez pobytů po „příště“ se blok nevykreslí; host ho nevidí', async () => {
    calendar(JANA)
    renderOverview(reservations({ upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-16')] }))
    await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(screen.queryByRole('region', { name: 'Potom a volno' })).not.toBeInTheDocument()

    cleanup()
    auth.isGuest = true
    calendar(JANA, stay('r-eva', 'Eva', '2026-12-28', '2026-12-30'))
    renderOverview(reservations({ upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-16')] }))
    await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(screen.queryByRole('region', { name: 'Potom a volno' })).not.toBeInTheDocument()
  })
})

describe('Přehled: boční panel s lehkým kontextem (#172)', () => {
  it('vzkaz je v bočním panelu, celá karta počasí na Přehledu není, bez dalšího pobytu karta příjezdu chybí', async () => {
    renderOverview(reservations())

    const aside = await screen.findByRole('complementary', { name: 'Kontext chaty' })
    // #685 (spec #677): Nástěnka se ukáže až s načtenými preferencemi
    expect(await within(aside).findByTestId('dashboard-handover-widget')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-weather-widget')).not.toBeInTheDocument()
    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByRole('region', { name: 'Další příjezd' })).not.toBeInTheDocument()
  })
})

// #682 (spec #677): „Důležité“ nahradilo „Potřebuje pozornost“. Běžné Dochází a položky bez ★ na Přehled nepatří.
describe('Přehled: „Důležité“ (#682)', () => {
  // Pořadí zásob dává server, tady už seřazené. Výchozí zásoba je Došlo ★, jediná, která do Důležité patří.
  const supply = (name: string, isEmpty = true, isEssential = true): AttentionItem =>
    ({ name, isEmpty, isEssential, inventoryId: `inv-${name}`, shoppingItemId: null })
  const starItem = (name: string): AttentionItem => ({ name, isEmpty: true, isEssential: true, inventoryId: null, shoppingItemId: `s-${name}` })
  const FAULT = { text: 'Kape kohoutek', reportedBy: 'Petr', reportedAt: '2026-11-15T12:00:00.000Z' }
  const withAttention = (...attention: AttentionItem[]): DashboardShoppingData => ({ ...NO_SHOPPING, attention })
  const STORM = { temp: 12, description: 'Oblačno', stormAlert: { day: 'Zítra', description: 'Bouřka' } }
  const gasEmpty = { username: 'Jana', userColor: null, userAnimalIcon: null, from: '2026-12-01', to: '2026-12-03', daysEmpty: 7, isCheckoutCompleted: true, checkoutState: { gas: 'empty' as const } }
  const note = (updatedAt: string) => responses.set('/dashboard/notes', { latestNotes: [], pinnedHandoverNote: 'Klíč je u sousedů.', handoverNoteAuthor: 'Jana', handoverNoteUpdatedAt: updatedAt })
  const important = () => screen.findByRole('region', { name: 'Důležité' })
  const rowTexts = (card: HTMLElement) => within(card).getAllByRole('listitem').map((r) => r.textContent)

  it('řádky jdou v pořadí bouřka → plyn a závada → Došlo ★, ukážou se tři a „+N dalších“ do Zásob', async () => {
    weather.current = STORM
    // Plyn ukáže Důležité, když ho „Visí na tobě“ nenese (výzvu člověk skryl)
    localStorage.setItem('dismissedNudges:Eva', JSON.stringify(['gas-empty-2026-12-03']))
    renderOverview(reservations({ lastStay: gasEmpty, lastFault: FAULT }), withAttention(supply('Toaleťák'), supply('Sirky')))

    const card = await important()
    await waitFor(() => expect(rowTexts(card)).toEqual(['VýstrahaZítra: Bouřka', 'DošloPlynová bomba', 'ZávadaKape kohoutek · Petr 15. 11.']))
    expect(within(card).getByRole('link', { name: '+ 2 další' })).toHaveAttribute('href', '/shopping?view=pantry')
  })

  it('Dochází a položky bez ★ se neukážou, Došlo ★ s „Koupím já“ ano', async () => {
    renderOverview(reservations(), withAttention(supply('Káva', false), supply('Sůl', true, false), supply('Toaleťák')))

    const card = await important()
    expect(rowTexts(card)).toEqual(['DošloToaleťákKoupím já'])
    expect(card).not.toHaveTextContent(/Káva|Sůl/)
    expect(screen.queryByRole('region', { name: 'Dochází' })).not.toBeInTheDocument()
    expect(screen.queryByText('K nakoupení')).not.toBeInTheDocument()
  })

  it('jen Dochází a položky bez ★: blok se nevykreslí', async () => {
    renderOverview(reservations(), withAttention(supply('Káva', false), supply('Sůl', true, false)))

    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByRole('region', { name: 'Důležité' })).not.toBeInTheDocument()
  })

  it('výstraha před bouřkou je v Důležité i tam, kde karta s počasím na Přehledu není (desktop)', async () => {
    weather.current = STORM
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1024px)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      renderOverview(reservations())
      expect(await within(await important()).findByText('Zítra: Bouřka')).toBeInTheDocument()
      expect(screen.queryByTestId('cabin-today')).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // #702: čerstvý vzkaz z nástěnky je poslední řádek Důležité, ťuknutí otevře nástěnku k úpravě
  it('vzkaz z nástěnky mladší než 14 dní je poslední řádek, starší se neukáže', async () => {
    note('2026-11-27T12:00:00.000Z') // 13 dní
    renderOverview(reservations(), withAttention(supply('Toaleťák')))
    await waitFor(async () => expect(rowTexts(await important())).toEqual(['DošloToaleťákKoupím já', 'VzkazKlíč je u sousedů. · Jana']))

    cleanup()
    note('2026-11-25T12:00:00.000Z') // 15 dní
    renderOverview(reservations())
    // Karta nástěnky vzkaz pořád ukazuje, jen v Důležité už není
    await waitFor(() => expect(screen.getByTestId('dashboard-handover-widget')).toHaveTextContent('Klíč je u sousedů.'))
    expect(screen.queryByRole('region', { name: 'Důležité' })).not.toBeInTheDocument()
  })

  it('ťuknutí na řádek vzkazu otevře nástěnku, uložená úprava se hned ukáže v Důležité', async () => {
    note('2026-12-09T08:00:00.000Z')
    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      data: { pinnedHandoverNote: 'Klíč je pod rohožkou.', handoverNoteAuthor: 'Eva', handoverNoteUpdatedAt: '2026-12-10T09:00:00.000Z' },
    } as never)
    renderOverview(reservations())

    fireEvent.click(await within(await important()).findByRole('button', { name: /Vzkaz/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Vzkaz' })
    const textbox = within(sheet).getByRole('textbox', { name: 'Vzkaz' })
    expect(textbox).toHaveValue('Klíč je u sousedů.')
    fireEvent.change(textbox, { target: { value: 'Klíč je pod rohožkou.' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Uložit vzkaz' }))

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/workspace/handover-note', { note: 'Klíč je pod rohožkou.' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Vzkaz' })).not.toBeInTheDocument())
    expect(rowTexts(await important())).toEqual(['VzkazKlíč je pod rohožkou. · Eva'])
  })

  it('když se vzkaz nepodaří uložit, nástěnka zůstane otevřená s rozepsaným textem a ukáže chybu', async () => {
    note('2026-12-09T08:00:00.000Z')
    vi.mocked(apiClient.patch).mockRejectedValueOnce(new Error('Chyba serveru'))
    render(<Toast />)
    renderOverview(reservations())

    fireEvent.click(await within(await important()).findByRole('button', { name: /Vzkaz/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Vzkaz' })
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Vzkaz' }), { target: { value: 'Nový vzkaz' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Uložit vzkaz' }))

    expect(await screen.findByTestId('toast')).toHaveTextContent('Vzkaz se nepodařilo uložit')
    expect(within(screen.getByRole('dialog', { name: 'Vzkaz' })).getByRole('textbox', { name: 'Vzkaz' })).toHaveValue('Nový vzkaz')
  })

  it('host vidí jen výstrahu před bouřkou, zásoby, závadu ani vzkaz ne', async () => {
    auth.isGuest = true
    weather.current = STORM
    note('2026-12-09T08:00:00.000Z')
    renderOverview(reservations({ lastStay: gasEmpty, lastFault: FAULT }), withAttention(supply('Toaleťák')))

    const card = await important()
    await waitFor(() => expect(rowTexts(card)).toEqual(['VýstrahaZítra: Bouřka']))
  })

  // #685 (spec #677, „Desktop: hlavní sloupec Visí na tobě → Kdo jede → Důležité“): dřív byl v bočním panelu
  it('na desktopu je v hlavním sloupci', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1024px)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      renderOverview(reservations(), withAttention(supply('Káva')))
      expect(screen.getByTestId('dashboard-page')).toContainElement(await screen.findByRole('region', { name: 'Důležité' }))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('„Koupím já“ u zásoby pošle slib přes zásobu, u ★ položky přes „Přivezu z domova“, řádek hned zmizí', async () => {
    renderOverview(reservations(), withAttention(supply('Toaleťák', true), starItem('Baterky'), supply('Káva')))

    const card = await screen.findByRole('region', { name: 'Důležité' })
    fireEvent.click(within(card).getByRole('button', { name: 'Koupím já: Toaleťák' }))
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/inventory/inv-Toaleťák/pledge'))
    await waitFor(() => expect(card).not.toHaveTextContent('Toaleťák'))
    fireEvent.click(within(card).getByRole('button', { name: 'Koupím já: Baterky' }))
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/shopping-list/s-Baterky/purchase', { status: 'bring_from_home' }))
    await waitFor(() => expect(card).not.toHaveTextContent('Baterky'))
    expect(card).toHaveTextContent('Káva')
  })

  it('když server slib odmítne, řádek se vrátí', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Chyba serveru'))
    renderOverview(reservations(), withAttention(supply('Toaleťák', true)))

    const card = await screen.findByRole('region', { name: 'Důležité' })
    fireEvent.click(within(card).getByRole('button', { name: 'Koupím já: Toaleťák' }))
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/inventory/inv-Toaleťák/pledge'))
    expect(await within(card).findByText('Toaleťák')).toBeInTheDocument()
  })

  // #511: omylem klepnutý slib jde vzít zpět z toastu. Odpověď API zároveň posune „server“: další načtení Přehledu vrátí `shopping`.
  const serverReply = (data: unknown, shopping?: DashboardShoppingData) => () => {
    if (shopping) responses.set('/dashboard/shopping', shopping)
    return Promise.resolve({ data } as never)
  }
  const lastPuts = (n: number) => vi.mocked(apiClient.put).mock.calls.slice(-n)
  const attentionCard = () => screen.queryByRole('region', { name: 'Důležité' })
  const undoFromToast = async (title: string) => {
    const toast = await screen.findByTestId('toast')
    expect(toast).toHaveTextContent(title)
    fireEvent.click(within(toast).getByRole('button', { name: 'Zpět' }))
    await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument())
  }

  it('po „Koupím já“ je toast „Přivezeš: …“, Zpět vrátí položku na Koupit i stav zásoby a řádek se vrátí (#511)', async () => {
    const before = withAttention({ ...supply('Toaleťák', true), shoppingItemId: 's-T' }, supply('Káva'))
    vi.mocked(apiClient.post).mockImplementationOnce(serverReply({ id: 's-T', status: 'bring_from_home', created: false, supplyStatusBefore: 'EMPTY' }, withAttention(supply('Káva'))))
    vi.mocked(apiClient.put).mockImplementationOnce(serverReply({})).mockImplementationOnce(serverReply({}, before))
    render(<Toast />)
    renderOverview(reservations(), before)

    fireEvent.click(await screen.findByRole('button', { name: 'Koupím já: Toaleťák' }))
    expect(await screen.findByTestId('toast')).toHaveTextContent('Přivezeš: Toaleťák.')
    await waitFor(() => expect(attentionCard()).not.toHaveTextContent('Toaleťák'))
    await undoFromToast('Přivezeš: Toaleťák.')

    await waitFor(() => expect(lastPuts(2)).toEqual([
      ['/shopping-list/s-T/purchase', { status: 'pending' }],
      ['/inventory/inv-Toaleťák', { status: 'EMPTY' }],
    ]))
    await waitFor(() => expect(attentionCard()).toHaveTextContent('Toaleťák'))
  })

  it('Zpět u položky, kterou slib teprve přidal, ji smaže a vrátí zásobě původní stav (#511)', async () => {
    const before = withAttention(supply('Káva'))
    vi.mocked(apiClient.post).mockImplementationOnce(serverReply({ id: 's-new', status: 'bring_from_home', created: true, supplyStatusBefore: 'LOW' }, NO_SHOPPING))
    vi.mocked(apiClient.delete).mockImplementationOnce(serverReply({ success: true }))
    vi.mocked(apiClient.put).mockImplementationOnce(serverReply({}, before))
    render(<Toast />)
    renderOverview(reservations(), before)

    fireEvent.click(await screen.findByRole('button', { name: 'Koupím já: Káva' }))
    await undoFromToast('Přivezeš: Káva.')

    await waitFor(() => expect(lastPuts(1)).toEqual([['/inventory/inv-Káva', { status: 'LOW' }]]))
    expect(apiClient.delete).toHaveBeenCalledWith('/shopping-list/s-new')
    await waitFor(() => expect(attentionCard()).toHaveTextContent('Káva'))
  })

  it('Zpět u ★ položky bez zásoby ji vrátí na Koupit (#511)', async () => {
    const before = withAttention(starItem('Baterky'))
    vi.mocked(apiClient.put)
      .mockImplementationOnce(serverReply({ id: 's-Baterky', status: 'bring_from_home' }, NO_SHOPPING))
      .mockImplementationOnce(serverReply({ id: 's-Baterky', status: 'pending' }, before))
    render(<Toast />)
    renderOverview(reservations(), before)

    fireEvent.click(await screen.findByRole('button', { name: 'Koupím já: Baterky' }))
    await undoFromToast('Přivezeš: Baterky.')

    await waitFor(() => expect(lastPuts(1)).toEqual([['/shopping-list/s-Baterky/purchase', { status: 'pending' }]]))
    expect(await screen.findByRole('button', { name: 'Koupím já: Baterky' })).toBeInTheDocument()
  })

  it('Zpět bez signálu zařadí do offline fronty všechny kroky, ne jen první (#511)', async () => {
    const queued = () => Promise.reject(Object.assign(new Error('Network Error'), { queuedOffline: true }))
    vi.mocked(apiClient.post).mockImplementationOnce(serverReply({ id: 's-off', status: 'bring_from_home', created: true, supplyStatusBefore: 'EMPTY' }, NO_SHOPPING))
    vi.mocked(apiClient.delete).mockImplementationOnce(queued)
    vi.mocked(apiClient.put).mockImplementationOnce(queued)
    render(<Toast />)
    renderOverview(reservations(), withAttention(supply('Sirky', true)))

    fireEvent.click(await screen.findByRole('button', { name: 'Koupím já: Sirky' }))
    await undoFromToast('Přivezeš: Sirky.')

    await waitFor(() => expect(lastPuts(1)).toEqual([['/inventory/inv-Sirky', { status: 'EMPTY' }]]))
    expect(apiClient.delete).toHaveBeenCalledWith('/shopping-list/s-off')
  })

  it('„Zkopírovat pro WhatsApp“ zkopíruje všechny věci i za souhrnem', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderOverview(reservations(), withAttention(supply('D', true), supply('A'), supply('B'), supply('C')))

    const card = await screen.findByRole('region', { name: 'Důležité' })
    fireEvent.click(within(card).getByRole('button', { name: 'Zkopírovat pro WhatsApp' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      `Na chatě potřebuje pozornost:\n- Došlo: D\n- Došlo: A\n- Došlo: B\n- Došlo: C\n${window.location.origin}/shopping`,
    ))
  })

  it('když nic nepotřebuje pozornost, karta se nevykreslí', async () => {
    renderOverview(reservations())

    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByRole('region', { name: 'Důležité' })).not.toBeInTheDocument()
  })
})

describe('Přehled: jen akce a stav chaty (#172)', () => {
  it('Údržba na Přehledu není ani s otevřenými úkoly, žije v Rekonstrukci', async () => {
    responses.set('/dashboard/reconstruction', { totalActiveCount: 1, items: [{ id: 'x', title: 'Okap', category: 'repair', status: 'approved', votesCount: 1, createdBy: 'Petr', deadline: null }] })
    renderOverview(reservations())

    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByText('Údržba')).not.toBeInTheDocument()
    expect(screen.queryByText('Okap')).not.toBeInTheDocument()
    expect(vi.mocked(apiClient.get).mock.calls.map(([url]) => url)).not.toContain('/dashboard/reconstruction')
  })
})

describe('Přehled: kompaktní karta chaty a pozvánka (#172, #338)', () => {
  it('karta nahoře ukazuje jméno chaty, dnešní datum a počasí, pruh CabinHero není', async () => {
    weather.current = { temp: -3.4, description: 'Zataženo' }
    renderOverview(reservations())

    const today = await screen.findByTestId('cabin-today')
    expect(await within(today).findByRole('heading', { level: 1, name: 'Chata U Lesa' })).toBeInTheDocument()
    await waitFor(() => expect(today).toHaveTextContent('Čtvrtek 10. prosince · −3 °C · Zataženo'))
    expect(screen.getByTestId('dashboard-page')).toContainElement(today)
    expect(screen.queryByTestId('cabin-hero')).not.toBeInTheDocument()
  })

  it('na desktopu karta na Přehledu není (dnešek je v menu), jméno chaty zůstává jako skrytý nadpis', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1024px)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      renderOverview(reservations())
      expect(await screen.findByRole('heading', { level: 1, name: 'Chata U Lesa' })).toHaveClass('sr-only')
      expect(screen.queryByTestId('cabin-today')).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('výstrahu na bouřku z dalších dnů ukáže karta pod řádkem počasí', async () => {
    weather.current = { temp: 12, description: 'Oblačno', stormAlert: { day: 'Zítra', description: 'Bouřka' } }
    renderOverview(reservations())

    const today = await screen.findByTestId('cabin-today')
    expect(await within(today).findByText('Zítra: Bouřka')).toBeInTheDocument()
  })

  it('bez lokality počasí nabídne karta správci odkaz do nastavení, členovi nic', async () => {
    weather.current = 'EMPTY_LOCATION'
    auth.isAdmin = true
    renderOverview(reservations())

    const today = await screen.findByTestId('cabin-today')
    expect(await within(today).findByRole('link', { name: 'Nastavit lokalitu počasí' })).toHaveAttribute('href', '/admin/cabin')
  })

  it('s vybranou obcí nabídne karta odkaz „Akce v kraji“ na kalendář Kudy z nudy v novém panelu (#283)', async () => {
    renderOverview(reservations(), NO_SHOPPING, { municipalityName: 'Telč', municipalityRegion: 'Kraj Vysočina' })

    const today = await screen.findByTestId('cabin-today')
    const link = await within(today).findByRole('link', { name: 'Akce v kraji (otevře web Kudy z nudy)' })
    expect(link).toHaveTextContent('Akce v kraji')
    expect(link).toHaveAttribute('href', 'https://www.kudyznudy.cz/kalendar-akci/kraj-vysocina')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('bez vybrané obce odkaz „Akce v kraji“ není (#283)', async () => {
    renderOverview(reservations())

    const today = await screen.findByTestId('cabin-today')
    await within(today).findByRole('heading', { level: 1, name: 'Chata U Lesa' })
    expect(within(today).queryByRole('link', { name: /Akce v kraji/ })).not.toBeInTheDocument()
  })

  it('když se nic neděje, je místo karty stavu pozvánka se scénou chaty místo ilustrace a tlačítkem „Zabrat termín“', async () => {
    renderOverview(reservations())

    const invite = await screen.findByRole('region', { name: 'Chata zatím čeká' })
    expect(within(invite).getByText('Zaber termín a rozjeď to.')).toBeInTheDocument()
    // #579: scéna chaty nahradila starý obrázek dveří (změnu chování schválil uživatel 2026-11-25).
    // #685 (spec #677): Scéna chaty je samostatný blok nad kartou, ne její část.
    expect(await screen.findByRole('img', { name: /^Scéna chaty/ })).toBeInTheDocument()
    expect(within(invite).queryByTestId('overview-invite-media')).not.toBeInTheDocument()
    expect(within(invite).getByRole('button', { name: 'Zabrat termín' })).toBeInTheDocument()
  })

  it('s plánovaným pobytem pozvánka není', async () => {
    renderOverview(reservations({ upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-28', '2026-12-30')] }))

    await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(screen.queryByRole('region', { name: 'Chata zatím čeká' })).not.toBeInTheDocument()
  })
})

describe('Desktop: dnešek chaty v hlavičce levého menu (#338)', () => {
  function renderSidebar(cabin: Partial<CabinSettings> = {}, today = <CabinToday variant="sidebar" />) {
    responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [], ...cabin })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <DesktopSidebar onOpenProfileDrawer={vi.fn()} today={today} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    return screen.getByTestId('desktop-sidebar')
  }

  it('pod názvem chaty je dnešní datum, počasí dnes a „Akce v kraji“, před navigací', async () => {
    weather.current = { temp: 0.2, description: 'Zataženo' }
    const sidebar = renderSidebar({ municipalityRegion: 'Kraj Vysočina' })

    const today = within(sidebar).getByTestId('cabin-today')
    expect(today).toHaveTextContent('Čtvrtek 10. prosince')
    await waitFor(() => expect(today).toHaveTextContent('0 °C · Zataženo'))
    expect(await within(today).findByRole('link', { name: 'Akce v kraji (otevře web Kudy z nudy)' })).toHaveAttribute('href', 'https://www.kudyznudy.cz/kalendar-akci/kraj-vysocina')
    expect(within(sidebar).getByTestId('desktop-home-link').compareDocumentPosition(today)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(today.compareDocumentPosition(within(sidebar).getByRole('navigation', { name: 'Hlavní navigace' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(within(today).queryByRole('heading')).not.toBeInTheDocument()
  })

  // #685 (spec #677): přepínače Počasí a Akce v kraji platí i pro dnešek v levém menu
  it('Počasí a Akce v kraji v menu podle preferencí: výchozí jen počasí, vypnuté počasí zmizí', async () => {
    weather.current = { temp: 0.2, description: 'Zataženo' }
    responses.set('/users/me', { dashboardPrefs: null })
    let today = within(renderSidebar({ municipalityRegion: 'Kraj Vysočina' }, <SidebarToday />)).getByTestId('cabin-today')
    await waitFor(() => expect(today).toHaveTextContent('0 °C · Zataženo'))
    expect(within(today).queryByRole('link', { name: /Akce v kraji/ })).not.toBeInTheDocument()

    cleanup()
    responses.set('/users/me', { dashboardPrefs: { weather: false, regionEvents: true } })
    today = within(renderSidebar({ municipalityRegion: 'Kraj Vysočina' }, <SidebarToday />)).getByTestId('cabin-today')
    expect(await within(today).findByRole('link', { name: 'Akce v kraji (otevře web Kudy z nudy)' })).toBeInTheDocument()
    expect(today).not.toHaveTextContent('°C')
  })

  it('výstraha na bouřku a správci odkaz na nastavení lokality jsou pod datem', async () => {
    weather.current = { temp: 12, description: 'Oblačno', stormAlert: { day: 'Zítra', description: 'Bouřka' } }
    const today = within(renderSidebar()).getByTestId('cabin-today')
    expect(await within(today).findByText('Zítra: Bouřka')).toBeInTheDocument()

    cleanup()
    weather.current = 'EMPTY_LOCATION'
    auth.isAdmin = true
    const adminToday = within(renderSidebar()).getByTestId('cabin-today')
    expect(await within(adminToday).findByRole('link', { name: 'Nastavit lokalitu počasí' })).toHaveAttribute('href', '/admin/cabin')
  })
})

describe('Přehled: „Visí na tobě“ jako akční karta (#172)', () => {
  const lastStay = (daysEmpty: number, gas: 'low' | 'empty' | null = null) => ({
    username: 'Jana', userColor: null, userAnimalIcon: null, from: '2026-11-10', to: '2026-11-12',
    isCheckoutCompleted: true, daysEmpty, checkoutState: gas ? { gas } : null,
  })
  // #677/#274: výzva „Chata je prázdná ≥ 14 dní“ zanikla a plyn je výzvou jen pro toho, kdo přijede příště
  // (Eva), proto testy karty stojí na plynu a vlastním odjezdu místo dlouho prázdné chaty.
  const gasForEva = () => reservations({ lastStay: lastStay(20, 'empty'), upcomingReservations: [upcoming('r-eva', 'Eva', '2026-12-11', '2026-12-13')] })
  const leavingToday = () => reservations({ activeReservation: { ...NOVAKOVI_NOW, username: 'Eva', to: TODAY }, departingToday: true, departingReservationId: 'r-now' })

  it('upozornění je v hlavním sloupci jako karta, první má tlačítko, které vede rovnou do úkolu', async () => {
    renderOverview(gasForEva())

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    expect(screen.getByTestId('dashboard-page')).toContainElement(card)
    expect(card).toHaveTextContent('Plynová bomba: Došlo')
    expect(within(card).getByRole('link', { name: 'Otevřít Zásoby' })).toHaveAttribute('href', '/shopping?view=pantry')
  })

  it('upozornění s akcí jdou napřed, vidět jsou nejvýš dvě, zbytek je za „Zobrazit víc“, zásoby jen v kartě „Dochází“', async () => {
    renderOverview(
      { ...gasForEva(), myNextReservation: { from: '2026-12-11', to: '2026-12-13', purpose: 'Víkend' } },
      {
        ...NO_SHOPPING, totalPendingShoppingCount: 1, essentialWarning: { count: 1, items: [{ name: 'Káva' }] },
        attention: [{ name: 'Sirky', isEmpty: true, isEssential: true, inventoryId: 'inv-s', shoppingItemId: null }],
      },
    )

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    const items = within(card).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByRole('link', { name: 'Otevřít Zásoby' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Na chatě došlo: Sirky')
    expect(card).not.toHaveTextContent('Na chatě dochází')
    fireEvent.click(within(card).getByRole('button', { name: 'Zobrazit víc (1)' }))
    expect(within(card).getAllByRole('listitem')).toHaveLength(3)
    expect(card).toHaveTextContent('Zítra jedeš na chatu')
    expect(within(card).getByRole('button', { name: 'Zobrazit méně' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('upozornění pro rodinu má tlačítko s textem „Zkopírovat pro WhatsApp“, které zkopíruje zprávu s odkazem (#264)', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderOverview(gasForEva())

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    const copy = within(card).getByRole('button', { name: 'Zkopírovat pro WhatsApp' })
    expect(copy).toHaveTextContent('Zkopírovat pro WhatsApp')
    fireEvent.click(copy)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`Plynová bomba: Došlo\\. Přivezu novou\\.\\n${window.location.origin}/shopping\\?view=pantry$`)),
    ))
    expect(await within(card).findByRole('button', { name: 'Zkopírováno' })).toBeInTheDocument()
  })

  // Přehled bez scrollování na desktopu (#356): hlavní sloupec nese stav pobytu, akce jdou do bočního panelu
  const oneAttentionRow: DashboardShoppingData = {
    ...NO_SHOPPING,
    attention: [{ name: 'Káva', isEmpty: true, isEssential: true, inventoryId: 'inv-k', shoppingItemId: null }],
  }

  // #685 (spec #677, „Desktop: hlavní sloupec Visí na tobě → Kdo jede → Důležité“): dřív byla v bočním panelu (#356)
  it('na desktopu je v hlavním sloupci nad „Důležité“, v bočním panelu není', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1024px)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      renderOverview(leavingToday(), oneAttentionRow)
      const page = screen.getByTestId('dashboard-page')
      const card = await within(page).findByRole('region', { name: 'Visí na tobě' })
      const attention = await within(page).findByRole('region', { name: 'Důležité' })
      expect(screen.getByRole('complementary', { name: 'Kontext chaty' })).not.toContainElement(card)
      expect(card.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('na mobilu zůstává nahoře v hlavním sloupci před „Důležité“ a „Na chatě teď“ (#356)', async () => {
    renderOverview({ ...leavingToday(), upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-17')] }, oneAttentionRow)

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    const page = screen.getByTestId('dashboard-page')
    expect(page).toContainElement(card)
    const order = within(page).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(order.indexOf('Visí na tobě')).toBeLessThan(order.indexOf('Důležité'))
    expect(order.indexOf('Důležité')).toBeLessThan(order.indexOf('Na chatě teď'))
  })

  it('skryté upozornění zmizí a když nic nevisí, karta se nevykreslí', async () => {
    renderOverview(leavingToday())

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    fireEvent.click(within(card).getByRole('button', { name: 'Skrýt' }))
    expect(screen.queryByRole('region', { name: 'Visí na tobě' })).not.toBeInTheDocument()
  })
})

// #425: Přehled neukazuje stejný obsah dvakrát. Stav, který nese akční karta, je v „Od minule“ jen tlumeně.
describe('Přehled: žádná duplicita (#425)', () => {
  const FAULT = { text: 'Kape kohoutek.', reportedBy: 'Jana', reportedAt: '2026-12-02T12:00:00.000Z' }
  const handover = (checkoutState: Record<string, unknown>, daysEmpty = 8) => reservations({
    upcomingReservations: [upcoming('r-petr', 'Petr', '2026-12-28', '2026-12-30')],
    lastStay: { username: 'Jana', userColor: null, userAnimalIcon: null, from: '2026-11-30', to: '2026-12-02', daysEmpty, isCheckoutCompleted: true, checkoutState },
  })
  // #685 (spec #677): „Od minule“ je samostatný blok, ne část karty „Na chatě teď“
  const briefingRow = async (text: string) => {
    const sinceLast = await screen.findByRole('region', { name: /^Od minule/ })
    return within(sinceLast).getByText(text).closest('li') as HTMLElement
  }
  const emphasized = (row: HTMLElement) => row.classList.contains('arrival-briefing-item--warn')

  // #677: po skrytí výzvy plyn nese „Důležité“, v „Od minule“ proto zůstane tlumeně (dřív se zase zvýraznil)
  it('plyn, na který upozorňuje „Visí na tobě“, je v „Od minule“ jen tlumeně, po skrytí upozornění ho nese „Důležité“', async () => {
    // #274: výzvu k plynu dostane jen ten, kdo přijede příště, proto je příští pobyt Evin
    renderOverview({ ...handover({ gas: 'low', heatingOff: true }), upcomingReservations: [upcoming('r-eva', 'Eva', '2026-12-28', '2026-12-30')] })

    const tray = await screen.findByRole('region', { name: 'Visí na tobě' })
    expect(within(tray).getByText('Plynová bomba: Dochází')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Důležité' })).not.toBeInTheDocument()
    expect(emphasized(await briefingRow('Plynová bomba: Dochází'))).toBe(false)

    fireEvent.click(within(tray).getByRole('button', { name: 'Skrýt' }))
    expect(screen.queryByRole('region', { name: 'Visí na tobě' })).not.toBeInTheDocument()
    expect(within(await screen.findByRole('region', { name: 'Důležité' })).getByText('Plynová bomba')).toBeInTheDocument()
    expect(emphasized(await briefingRow('Plynová bomba: Dochází'))).toBe(false)
  })

  // #677/#274: velký banner s formulářem odjezdu z Přehledu zmizel, připomínku nese jen výzva ve „Visí na tobě“
  it('odjezd dnes připomene jen výzva ve „Visí na tobě“, banner s formulářem není', async () => {
    renderOverview(reservations({
      activeReservation: { ...NOVAKOVI_NOW, username: 'Eva', to: TODAY },
      departingToday: true,
      departingReservationId: 'r-now',
    }))

    const tray = await screen.findByRole('region', { name: 'Visí na tobě' })
    expect(within(tray).getByText('Dnes odjíždíš.')).toBeInTheDocument()
    expect(screen.queryByText('Dnes odjíždíš!')).not.toBeInTheDocument()
  })

  it('předávka odeslaná bez signálu: Přehled píše „Předávka chaty je vyplněná“ (#688)', async () => {
    enqueueMutation({ method: 'patch', url: checkoutPath('r-now'), data: {}, headers: {} } as InternalAxiosRequestConfig)
    renderOverview(reservations({
      activeReservation: { ...NOVAKOVI_NOW, username: 'Eva', to: TODAY },
      departingToday: true,
      departingReservationId: 'r-now',
    }))

    // #274: stav nese výzva ve „Visí na tobě“ místo zaniklého banneru, už bez tlačítka k vyplnění
    const tray = await screen.findByRole('region', { name: 'Visí na tobě' })
    expect(tray).toHaveTextContent('Předávka chaty je vyplněnáOdešle se, jakmile bude signál.')
    expect(within(tray).queryByRole('link', { name: 'Vyplnit předávku chaty' })).not.toBeInTheDocument()
  })

  it('závada z „Důležité“ je v „Od minule“ jen tlumeně, bez karty pozornosti zůstane zvýrazněná', async () => {
    renderOverview({ ...handover({ broken: 'Kape kohoutek.' }), lastFault: FAULT })

    const attention = await screen.findByRole('region', { name: 'Důležité' })
    expect(attention).toHaveTextContent('Kape kohoutek.')
    expect(emphasized(await briefingRow('Kape kohoutek.'))).toBe(false)

    cleanup()
    renderOverview(handover({ broken: 'Kape kohoutek.' }))
    expect(emphasized(await briefingRow('Kape kohoutek.'))).toBe(true)
  })

  // #274: plyn a Došlo ★ jsou výzvou Evy, protože přijede příště; Důležité je pak nezopakuje, Došlo ★ kopíruje výzva
  it('každé „Zkopírovat pro WhatsApp“ kopíruje jiný obsah, Došlo ★ jen jednou', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderOverview(
      {
        ...handover({ gas: 'empty', broken: 'Kape kohoutek.' }, 20), lastFault: FAULT, myNextReservation: { from: '2026-12-11', to: '2026-12-13', purpose: 'Víkend' },
        upcomingReservations: [upcoming('r-eva', 'Eva', '2026-12-11', '2026-12-13')],
      },
      {
        ...NO_SHOPPING,
        essentialWarning: { count: 1, items: [{ name: 'Káva' }] },
        attention: [{ name: 'Káva', isEmpty: true, isEssential: true, inventoryId: 'inv-k', shoppingItemId: null }],
      },
    )

    const tray = await screen.findByRole('region', { name: 'Visí na tobě' })
    fireEvent.click(within(tray).getByRole('button', { name: /Zobrazit víc/ }))
    const buttons = screen.getAllByRole('button', { name: 'Zkopírovat pro WhatsApp' })
    for (const button of buttons) fireEvent.click(button)
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(buttons.length))

    const texts = writeText.mock.calls.map(([text]) => text)
    expect(buttons.length).toBeGreaterThan(1)
    expect(new Set(texts).size).toBe(texts.length)
    expect(texts.filter((t) => /došlo:.*Káva/i.test(t))).toHaveLength(1)
    expect(texts.filter((t) => t.includes('- Závada: Kape kohoutek. (Jana, 2. 12.)'))).toHaveLength(1)
    expect(texts.filter((t) => t.includes('Plynová bomba: Došlo'))).toHaveLength(1)
  })
})

// #274 (pravidlo E3, spec #677): výzva jen tomu, kdo ji může splnit, a na Přehledu jen jednou.
describe('Přehled: „Visí na tobě“ jen pro toho, kdo může jednat (#274)', () => {
  const tray = () => screen.queryByRole('region', { name: 'Visí na tobě' })
  const leavingToday = (overrides: Partial<DashboardReservationsData> = {}) => reservations({
    activeReservation: { ...NOVAKOVI_NOW, username: 'Eva', to: TODAY },
    departingToday: true,
    departingReservationId: 'r-now',
    ...overrides,
  })
  const gasEmpty = { username: 'Jana', userColor: null, userAnimalIcon: null, from: '2026-12-01', to: '2026-12-03', daysEmpty: 7, isCheckoutCompleted: true, checkoutState: { gas: 'empty' as const } }
  const toiletPaper: DashboardShoppingData = { ...NO_SHOPPING, attention: [{ name: 'Toaleťák', isEmpty: true, isEssential: true, inventoryId: 'inv-t', shoppingItemId: null }] }
  const nextArrival = (username: string) => reservations({ lastStay: gasEmpty, upcomingReservations: [upcoming('r-next', username, '2026-12-14', '2026-12-16')] })

  it('v den mého odjezdu je výzva k předávce chaty jednou, jako řádek s tlačítkem na tab Předávka; formulář odjezdu na Přehledu není', async () => {
    renderOverview(leavingToday(), NO_SHOPPING, { departureChecklist: ['Zavřít okna'] })

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    expect(card).toHaveTextContent('Dnes odjíždíš.Vyplň předávku chaty pro toho, kdo přijede po tobě.')
    expect(within(card).getByRole('link', { name: 'Vyplnit předávku chaty' })).toHaveAttribute('href', '/handover')
    expect(screen.getAllByText(/Dnes odjíždíš/)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Vyplnit protokol' })).not.toBeInTheDocument()
    expect(screen.queryByText(/vyplň odjezdový checklist/i)).not.toBeInTheDocument()
  })

  // #220: náhrada za test DepartureBanneru (komponenta zmizí v druhé části #220); zapisuje jen tab Předávka, do chatu nic (ADR-0004)
  it('výzva k odjezdu vede na /handover a sama nic neukládá ani neposílá do chatu', async () => {
    renderOverview(leavingToday(), NO_SHOPPING, { departureChecklist: ['Zavřít okna'] })
    const link = within(await screen.findByRole('region', { name: 'Visí na tobě' })).getByRole('link', { name: 'Vyplnit předávku chaty' })
    expect(link).toHaveAttribute('href', '/handover')
    vi.mocked(apiClient.patch).mockClear()
    vi.mocked(apiClient.post).mockClear()

    fireEvent.click(link)

    expect(apiClient.patch).not.toHaveBeenCalled()
    expect(apiClient.post).not.toHaveBeenCalled()
  })

  it.each([
    ['člen, který dnes neodjíždí', { ...NOVAKOVI_NOW, to: TODAY }],
    ['po vyplnění předávky', { ...NOVAKOVI_NOW, username: 'Eva', to: TODAY, isCheckoutCompleted: true }],
  ])('%s: výzva k předávce není ani v kartě „Na chatě teď“', async (_who, activeReservation) => {
    renderOverview(reservations({ activeReservation }), NO_SHOPPING, { departureChecklist: ['Zavřít okna'] })
    await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(tray()).not.toBeInTheDocument()
    expect(screen.queryByText(/vyplň odjezdový checklist/i)).not.toBeInTheDocument()
  })

  it('plyn a Došlo ★ jsou výzvou jen pro toho, kdo přijede příště, a v Důležité je znovu nevidí', async () => {
    renderOverview(nextArrival('Eva'), toiletPaper)

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    expect(card).toHaveTextContent('Plynová bomba: Došlo')
    expect(card).toHaveTextContent('Na chatě došlo: Toaleťák')
    expect(screen.queryByRole('region', { name: 'Důležité' })).not.toBeInTheDocument()
  })

  it.each([
    ['ostatní člen', false],
    ['správce, který nikam nejede', true],
  ])('%s vidí plyn a Došlo ★ jen v Důležité, výzvu nedostane', async (_who, isAdmin) => {
    auth.isAdmin = isAdmin
    renderOverview(nextArrival('Jana'), toiletPaper)

    const important = await screen.findByRole('region', { name: 'Důležité' })
    expect(important).toHaveTextContent('Plynová bomba')
    expect(important).toHaveTextContent('Toaleťák')
    expect(tray()).not.toBeInTheDocument()
  })

  it('když nic nevisí, „Visí na tobě“ se nevykreslí; dlouho prázdná chata výzvou není', async () => {
    renderOverview(reservations({ lastStay: { ...gasEmpty, daysEmpty: 30, checkoutState: null }, upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-16')] }))

    await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(tray()).not.toBeInTheDocument()
    expect(screen.queryByText(/Chata je prázdná 30 dní/)).not.toBeInTheDocument()
  })

  it('host dostane výzvu k předávce v den svého odjezdu, jinak žádnou', async () => {
    auth.isGuest = true
    renderOverview(leavingToday({ lastStay: gasEmpty, myNextReservation: { from: '2026-12-11', to: '2026-12-12', purpose: 'Víkend' } }))

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    expect(within(card).getAllByRole('listitem')).toHaveLength(1)
    expect(card).toHaveTextContent('Dnes odjíždíš.')
    // Host na tab Předávka nesmí (403, #216), výzva ho vede do detailu pobytu (#220)
    expect(within(card).getByRole('link', { name: 'Vyplnit předávku chaty' })).toHaveAttribute('href', '/reservations?pobyt=r-now')

    cleanup()
    renderOverview(nextArrival('Eva'))
    await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(tray()).not.toBeInTheDocument()
  })
})

// #683 (spec #677): kdo si Došlo ★ vezme přes „Koupím já“, tomu zmizí; ostatní vidí, kdo ji koupí
describe('Přehled: „Koupí: <jméno>“ u slíbené Došlo ★ (#683)', () => {
  const toiletPaper: AttentionItem = { name: 'Toaleťák', isEmpty: true, isEssential: true, inventoryId: 'inv-t', shoppingItemId: null }
  const claimedBy = (buyer: string): DashboardShoppingData => ({ ...NO_SHOPPING, claimed: [{ name: 'Toaleťák', inventoryId: 'inv-t', shoppingItemId: 's-t', buyer }] })
  const important = () => screen.queryByRole('region', { name: 'Důležité' })
  const tray = () => screen.queryByRole('region', { name: 'Visí na tobě' })
  const shoppingFetches = () => vi.mocked(apiClient.get).mock.calls.filter(([url]) => url === '/dashboard/shopping').length
  const nextArrival = (username: string) => reservations({ upcomingReservations: [upcoming('r-next', username, '2026-12-14', '2026-12-16')] })

  it('ostatní vidí u věci „Koupí: Jana“ místo tlačítka, vyřešené až za otevřenými věcmi a vzkazem', async () => {
    responses.set('/dashboard/notes', { latestNotes: [], pinnedHandoverNote: 'Klíč je u sousedů.', handoverNoteAuthor: 'Jana', handoverNoteUpdatedAt: '2026-12-09T08:00:00.000Z' })
    renderOverview(reservations(), { ...claimedBy('Jana'), attention: [{ ...toiletPaper, name: 'Sirky', inventoryId: 'inv-s' }] })

    const card = await screen.findByRole('region', { name: 'Důležité' })
    await waitFor(() => expect(within(card).getAllByRole('listitem').map((r) => r.textContent)).toEqual([
      'DošloSirkyKoupím já', 'VzkazKlíč je u sousedů. · Jana', 'VyřešenoToaleťákKoupí: Jana',
    ]))
    expect(within(card).queryByRole('button', { name: 'Koupím já: Toaleťák' })).not.toBeInTheDocument()
  })

  it('kdo věc slíbil, tomu po „Koupím já“ zmizí a nevrátí se ani jako „Koupí: Eva“', async () => {
    vi.mocked(apiClient.post).mockImplementationOnce(() => {
      responses.set('/dashboard/shopping', claimedBy('Eva'))
      return Promise.resolve({ data: { id: 's-t', status: 'bring_from_home', created: true, supplyStatusBefore: 'EMPTY' } } as never)
    })
    renderOverview(reservations(), { ...NO_SHOPPING, attention: [toiletPaper] })

    fireEvent.click(await screen.findByRole('button', { name: 'Koupím já: Toaleťák' }))
    await waitFor(() => expect(shoppingFetches()).toBeGreaterThan(1))
    await screen.findByText('Chata zatím čeká')
    expect(important()).not.toBeInTheDocument()
    expect(screen.queryByText(/Koupí:/)).not.toBeInTheDocument()
  })

  it('kdo přijede příště a věc slíbil, nemá ji ve „Visí na tobě“ ani v Důležité', async () => {
    renderOverview(nextArrival('Eva'), claimedBy('Eva'))

    await screen.findByRole('region', { name: 'Na chatě teď' })
    await waitFor(() => expect(shoppingFetches()).toBeGreaterThan(0))
    expect(tray()).not.toBeInTheDocument()
    expect(important()).not.toBeInTheDocument()
  })

  it('kdo přijede příště a věc slíbil někdo jiný, nedostane výzvu, v Důležité vidí „Koupí: Jana“', async () => {
    renderOverview(nextArrival('Eva'), claimedBy('Jana'))

    const card = await screen.findByRole('region', { name: 'Důležité' })
    expect(card).toHaveTextContent('ToaleťákKoupí: Jana')
    expect(tray()).not.toBeInTheDocument()
  })

  it('host slib nevidí', async () => {
    auth.isGuest = true
    renderOverview(reservations(), claimedBy('Jana'))

    await screen.findByText('Chata zatím čeká')
    expect(important()).not.toBeInTheDocument()
  })
})

// #685 (spec #677): Přehled odpovídá na kdo jede, co je důležité a jaké bude počasí; ostatní si každý zapne sám
describe('Přehled: výchozí minimum a bloky podle preferencí (#685)', () => {
  // Eva přijede příště (v okně předpovědi na pobyt) a čeká na ni výzva k plynu, Ida jede po ní (Potom a volno)
  const lastStay = { username: 'Jana', userColor: null, userAnimalIcon: null, from: '2026-12-01', to: '2026-12-03', daysEmpty: 7, isCheckoutCompleted: true, checkoutState: { gas: 'empty' as const, heatingOff: true } }
  const calendarStay = (id: string, username: string, from: string, to: string) => ({ id, userId: `u-${username}`, username, from, to, purpose: 'Víkend', status: 'primary' })
  const OPTIONAL = {
    'Scéna chaty': () => screen.queryByRole('img', { name: /^Scéna chaty/ }),
    'Od minule': () => screen.queryByRole('region', { name: /^Od minule/ }),
    'Potom a volno': () => screen.queryByRole('region', { name: 'Potom a volno' }),
    'Předpověď na pobyt': () => screen.queryByTestId('dashboard-stay-weather-widget'),
    'Akce v kraji': () => screen.queryByRole('link', { name: /Akce v kraji/ }),
    Nástěnka: () => screen.queryByTestId('dashboard-handover-widget'),
  }

  async function renderWithPrefs(dashboardPrefs: Record<string, boolean> | null) {
    weather.current = { temp: 5, description: 'Zataženo', stormAlert: { day: 'Zítra', description: 'Bouřka' } }
    responses.set('/users/me', { dashboardPrefs })
    responses.set('/reservations', { reservations: [calendarStay('r-eva', 'Eva', '2026-12-14', '2026-12-16'), calendarStay('r-ida', 'Ida', '2026-12-20', '2026-12-22')], availabilities: [] })
    renderOverview(
      reservations({ lastStay, upcomingReservations: [upcoming('r-eva', 'Eva', '2026-12-14', '2026-12-16')], myNextReservation: { from: '2026-12-14', to: '2026-12-16', purpose: 'Víkend' } }),
      NO_SHOPPING,
      { municipalityName: 'Telč', municipalityRegion: 'Kraj Vysočina' },
    )
    await screen.findByRole('region', { name: 'Na chatě teď' })
    await screen.findByRole('region', { name: 'Důležité' })
    await waitFor(() => expect(vi.mocked(apiClient.get).mock.calls.some(([url]) => url === '/users/me')).toBe(true))
  }
  const mandatoryShown = async () => {
    expect(screen.getByRole('heading', { level: 1, name: 'Chata U Lesa' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Na chatě teď' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Důležité' })).getByText('Zítra: Bouřka')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Visí na tobě' })).toHaveTextContent('Plynová bomba: Došlo')
  }

  it('bez preferencí je vidět hlavička, Kdo jede, Důležité, Visí na tobě a Počasí, nic dalšího', async () => {
    await renderWithPrefs(null)

    await mandatoryShown()
    await waitFor(() => expect(screen.getByTestId('cabin-today')).toHaveTextContent('5 °C · Zataženo'))
    for (const [name, query] of Object.entries(OPTIONAL)) expect(query(), name).not.toBeInTheDocument()
  })

  it('zapnuté bloky se objeví a vypnuté Počasí zmizí; Kdo jede, Důležité a Visí na tobě zůstanou', async () => {
    await renderWithPrefs({ ...ALL_BLOCKS, weather: false })

    await mandatoryShown()
    for (const [name, query] of Object.entries(OPTIONAL)) await waitFor(() => expect(query(), name).toBeInTheDocument())
    expect(screen.getByTestId('cabin-today')).not.toHaveTextContent('°C')
  })

  it('vypnout jde jen volitelné bloky: se vším vypnutým zůstane hlavička, Kdo jede, Důležité a Visí na tobě', async () => {
    await renderWithPrefs({ weather: false, cabinScene: false, sinceLast: false, laterAndFree: false, stayForecast: false, regionEvents: false, noticeboard: false })

    await mandatoryShown()
    for (const [name, query] of Object.entries(OPTIONAL)) expect(query(), name).not.toBeInTheDocument()
    expect(screen.getByTestId('cabin-today')).not.toHaveTextContent('°C')
  })

  const onDesktop = () => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1024px)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))

  it('desktop: Visí na tobě, Kdo jede a Důležité jsou v hlavním sloupci, zapnuté volitelné bloky v bočním', async () => {
    onDesktop()
    try {
      await renderWithPrefs(ALL_BLOCKS)
      const main = screen.getByTestId('dashboard-page')
      expect(main).toContainElement(await screen.findByRole('region', { name: 'Visí na tobě' }))
      expect(within(main).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Visí na tobě', 'Na chatě teď', 'Důležité'])
      const aside = screen.getByRole('complementary', { name: 'Kontext chaty' })
      // Akce v kraji je na desktopu v levém menu spolu s počasím (test „levé menu“ níž)
      for (const [name, query] of Object.entries(OPTIONAL).filter(([name]) => name !== 'Akce v kraji')) {
        await waitFor(() => expect(aside, name).toContainElement(query()))
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('desktop bez preferencí: boční sloupec se nevykreslí', async () => {
    onDesktop()
    try {
      await renderWithPrefs(null)
      expect(screen.getByTestId('dashboard-page')).toContainElement(screen.getByRole('region', { name: 'Důležité' }))
      expect(screen.queryByRole('complementary', { name: 'Kontext chaty' })).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('host vidí Kdo jede, Počasí a výstrahu v Důležité; preference ani volitelné bloky nemá', async () => {
    auth.isGuest = true
    weather.current = { temp: 5, description: 'Zataženo', stormAlert: { day: 'Zítra', description: 'Bouřka' } }
    responses.set('/users/me', { dashboardPrefs: { ...ALL_BLOCKS, weather: false } })
    renderOverview(reservations({ lastStay, upcomingReservations: [upcoming('r-eva', 'Eva', '2026-12-14', '2026-12-16')] }), NO_SHOPPING, { municipalityName: 'Telč', municipalityRegion: 'Kraj Vysočina' })

    await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(within(await screen.findByRole('region', { name: 'Důležité' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['VýstrahaZítra: Bouřka'])
    await waitFor(() => expect(screen.getByTestId('cabin-today')).toHaveTextContent('5 °C · Zataženo'))
    for (const [name, query] of Object.entries(OPTIONAL)) expect(query(), name).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Visí na tobě' })).not.toBeInTheDocument()
  })
})
