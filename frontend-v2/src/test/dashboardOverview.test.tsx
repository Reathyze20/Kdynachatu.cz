import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import apiClient from '@/api/client'
import type { DashboardReservationsData, DashboardShoppingData, UpcomingReservation } from '@/api/dashboard'

// Fiktivní API Přehledu (redesign #172). Žádná reálná data chaty.
const { responses, weather } = vi.hoisted(() => ({ responses: new Map<string, unknown>(), weather: { current: null as unknown } }))
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn((url: string) =>
      responses.has(url) ? Promise.resolve({ data: responses.get(url) }) : new Promise<never>(() => {}),
    ),
  },
}))
vi.mock('@/api/dashboard', () => ({ fetchWeather: vi.fn(() => Promise.resolve(weather.current)) }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-eva', cabinId: 'c-1', username: 'Eva' }, isAdmin: false }),
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

function renderOverview(data: DashboardReservationsData, shopping: DashboardShoppingData = NO_SHOPPING) {
  responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [] })
  responses.set('/dashboard/reservations', data)
  responses.set('/dashboard/shopping', shopping)
  responses.set('/dashboard/notes', { latestNotes: [], pinnedHandoverNote: null, handoverNoteAuthor: null, handoverNoteUpdatedAt: null })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
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
})

const NOVAKOVI_NOW = {
  id: 'r-now', username: 'Novákovi', userColor: null, userAnimalIcon: null,
  from: '2026-12-08', to: '2026-12-12', purpose: 'Víkend', handoverNote: null, isCheckoutCompleted: false,
}

describe('Přehled: řetězec turnusu teď → pak (#172)', () => {
  it('karta „na chatě teď“ ukazuje řádek se dvěma dalšími pevnými pobyty, vlastní jako „Ty“', async () => {
    renderOverview(reservations({
      activeReservation: NOVAKOVI_NOW,
      upcomingReservations: [
        upcoming('r-eva', 'Eva', '2026-12-14', '2026-12-16'),
        upcoming('r-backup', 'Petr', '2026-12-20', '2026-12-22', 'backup'),
        upcoming('r-jana', 'Jana', '2026-12-28', '2026-12-30'),
      ],
    }))

    const chain = await screen.findByRole('group', { name: 'Řetězec turnusu' })
    expect(screen.getByTestId('dashboard-reservation-widget')).toContainElement(chain)
    expect(chain).toHaveTextContent('Teď: Novákovi')
    expect(chain).toHaveTextContent('Další: Ty (po 14. 12.)')
    expect(chain).toHaveTextContent('Pak: Jana (po 28. 12.)')
    expect(within(chain).queryByText('Petr')).not.toBeInTheDocument()
  })

  it('bez pobytu přes dnešek začíná řádek „Volno“', async () => {
    renderOverview(reservations({ upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-28', '2026-12-30')] }))

    const chain = await screen.findByRole('group', { name: 'Řetězec turnusu' })
    expect(chain).toHaveTextContent('Teď: Volno')
    expect(chain).toHaveTextContent('Další: Jana (po 28. 12.)')
  })

  it('bez aktuálního i budoucího pobytu se řádek nevykreslí', async () => {
    renderOverview(reservations())

    await screen.findByTestId('dashboard-reservation-widget')
    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByRole('group', { name: 'Řetězec turnusu' })).not.toBeInTheDocument()
  })
})

describe('Přehled: boční panel s lehkým kontextem (#172)', () => {
  it('další příjezd je v bočním panelu, vlastní pobyt jako „Ty“, a karta stavu ho už neopakuje', async () => {
    renderOverview(reservations({
      activeReservation: NOVAKOVI_NOW,
      upcomingReservations: [upcoming('r-eva', 'Eva', '2026-12-14', '2026-12-16'), upcoming('r-jana', 'Jana', '2026-12-28', '2026-12-30')],
      myNextReservation: { from: '2026-12-14', to: '2026-12-16', purpose: 'Víkend' },
    }))

    const aside = await screen.findByRole('complementary', { name: 'Kontext chaty' })
    const next = await within(aside).findByRole('region', { name: 'Další příjezd' })
    expect(next).toHaveTextContent('Ty')
    expect(next).toHaveTextContent('14. – 16. prosince 2026')
    expect(next).toHaveTextContent('za 4 dny')
    expect(screen.getByTestId('dashboard-reservation-widget')).not.toHaveTextContent('Váš pobyt')
  })

  it('další příjezd ukáže i to, co řetězec ne: účel, počet nocí a kdo jede s ním', async () => {
    renderOverview(reservations({
      upcomingReservations: [{
        ...upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-17'),
        purpose: 'Řezání dřeva',
        participants: [{ userId: 'u-petr', username: 'Petr', userColor: null, userAnimalIcon: null }],
      }],
    }))

    const next = await screen.findByRole('region', { name: 'Další příjezd' })
    expect(next).toHaveTextContent('Řezání dřeva · 3 noci')
    expect(next).toHaveTextContent('Také jede')
    expect(within(next).getAllByTitle('Petr').length).toBeGreaterThan(0)
  })

  it('můj pobyt, který není hned další, ukáže boční panel zvlášť', async () => {
    renderOverview(reservations({
      upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-16'), upcoming('r-eva', 'Eva', '2026-12-28', '2026-12-30')],
      myNextReservation: { from: '2026-12-28', to: '2026-12-30', purpose: 'Víkend' },
    }))

    const next = await screen.findByRole('region', { name: 'Další příjezd' })
    expect(next).toHaveTextContent('Jana')
    expect(next).toHaveTextContent('Váš pobyt za 18 dní')
  })

  it('můj záložní pobyt se jako příjezd neukáže, počítají se jen pevné', async () => {
    renderOverview(reservations({
      upcomingReservations: [upcoming('r-eva', 'Eva', '2026-12-14', '2026-12-16', 'backup')],
      myNextReservation: { from: '2026-12-14', to: '2026-12-16', purpose: 'Víkend' },
    }))

    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByRole('region', { name: 'Další příjezd' })).not.toBeInTheDocument()
  })

  it('vzkaz je v bočním panelu, celá karta počasí na Přehledu není, bez dalšího pobytu karta příjezdu chybí', async () => {
    renderOverview(reservations())

    const aside = await screen.findByRole('complementary', { name: 'Kontext chaty' })
    expect(within(aside).getByTestId('dashboard-handover-widget')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-weather-widget')).not.toBeInTheDocument()
    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByRole('region', { name: 'Další příjezd' })).not.toBeInTheDocument()
  })
})

describe('Přehled: „Dochází“ v bočním panelu (#172)', () => {
  it('důležité položky a počet k nakoupení jsou v bočním panelu s odkazem do Zásob, banner ani widget nákupu nezůstaly', async () => {
    renderOverview(reservations(), {
      pendingShoppingItems: [{ id: 's1', name: 'Káva', listId: 'l1', listName: 'Nákup', isEssential: true }],
      totalPendingShoppingCount: 3,
      totalItemsCount: 5,
      essentialWarning: { count: 2, items: [{ name: 'Káva' }, { name: 'Sůl' }] },
    })

    const aside = await screen.findByRole('complementary', { name: 'Kontext chaty' })
    const low = await within(aside).findByRole('region', { name: 'Dochází' })
    expect(low).toHaveTextContent('Káva · Sůl')
    expect(low).toHaveTextContent('Na nákupním seznamu čekají 3 položky')
    expect(within(low).getByRole('link', { name: 'Otevřít Zásoby' })).toHaveAttribute('href', '/shopping')
    expect(screen.queryByText('K nakoupení')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Otevřít nákupy' })).not.toBeInTheDocument()
  })

  it('víc než pět důležitých položek zkrátí na „a N dalších“, bez důležitých zůstane jen počet', async () => {
    const names = ['Káva', 'Sůl', 'Cukr', 'Mýdlo', 'Sirky', 'Svíčky', 'Čaj']
    renderOverview(reservations(), {
      ...NO_SHOPPING, totalPendingShoppingCount: 7, essentialWarning: { count: 7, items: names.map((name) => ({ name })) },
    })
    const low = await screen.findByRole('region', { name: 'Dochází' })
    expect(low).toHaveTextContent('Káva · Sůl · Cukr · Mýdlo · Sirky a 2 další')
    expect(low).not.toHaveTextContent('Svíčky')
  })

  it('bez důležitých položek ukáže karta jen počet věcí k nakoupení', async () => {
    renderOverview(reservations(), { ...NO_SHOPPING, totalPendingShoppingCount: 1 })
    const low = await screen.findByRole('region', { name: 'Dochází' })
    expect(low).toHaveTextContent('Na nákupním seznamu čeká 1 položka.')
  })

  it('když nic nedochází a nic se nekupuje, karta se nevykreslí', async () => {
    renderOverview(reservations())

    await screen.findByRole('complementary', { name: 'Kontext chaty' })
    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByRole('region', { name: 'Dochází' })).not.toBeInTheDocument()
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

describe('Přehled: kompaktní pruh chaty a pozvánka (#172)', () => {
  it('pruh nahoře ukazuje jméno chaty, dnešní datum a počasí a má slot na fotku', async () => {
    weather.current = { temp: -3.4, description: 'Zataženo' }
    renderOverview(reservations())

    const hero = await screen.findByTestId('cabin-hero')
    expect(await within(hero).findByRole('heading', { level: 1, name: 'Chata U Lesa' })).toBeInTheDocument()
    await waitFor(() => expect(hero).toHaveTextContent('Čtvrtek 10. prosince · −3 °C · Zataženo'))
    expect(within(hero).getByTestId('cabin-hero-media')).toBeInTheDocument()
    expect(screen.getByTestId('two-column-layout')).not.toContainElement(hero)
  })

  it('když se nic neděje, je místo karty stavu pozvánka se slotem na ilustraci a tlačítkem „Zabrat termín“', async () => {
    renderOverview(reservations())

    const invite = await screen.findByRole('region', { name: 'Chata zatím čeká' })
    expect(within(invite).getByText('Zaberte termín a rozjeďte to.')).toBeInTheDocument()
    expect(within(invite).getByTestId('overview-invite-media')).toBeInTheDocument()
    expect(within(invite).getByRole('button', { name: 'Zabrat termín' })).toBeInTheDocument()
  })

  it('s plánovaným pobytem pozvánka není', async () => {
    renderOverview(reservations({ upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-28', '2026-12-30')] }))

    await screen.findByRole('group', { name: 'Řetězec turnusu' })
    expect(screen.queryByRole('region', { name: 'Chata zatím čeká' })).not.toBeInTheDocument()
  })
})

describe('Přehled: „Visí na vás“ jako akční karta (#172)', () => {
  const lastStay = (daysEmpty: number, gas: 'low' | 'empty' | null = null) => ({
    username: 'Jana', userColor: null, userAnimalIcon: null, from: '2026-11-10', to: '2026-11-12',
    isCheckoutCompleted: true, daysEmpty, checkoutState: gas ? { gas } : null,
  })

  it('upozornění je v hlavním sloupci jako karta, první má tlačítko, které vede rovnou do úkolu', async () => {
    renderOverview(reservations({ lastStay: lastStay(20) }))

    const card = await screen.findByRole('region', { name: 'Visí na vás' })
    expect(screen.getByTestId('dashboard-page')).toContainElement(card)
    expect(card).toHaveTextContent('Chata je prázdná 20 dní')
    expect(within(card).getByRole('button', { name: 'Otevřít kalendář' })).toBeInTheDocument()
  })

  it('upozornění s akcí jdou napřed, vidět jsou nejvýš dvě, zbytek je za „Zobrazit víc“, zásoby jen v kartě „Dochází“', async () => {
    renderOverview(
      reservations({ myNextReservation: { from: '2026-12-11', to: '2026-12-13', purpose: 'Víkend' }, lastStay: lastStay(20, 'empty') }),
      { ...NO_SHOPPING, totalPendingShoppingCount: 1, essentialWarning: { count: 1, items: [{ name: 'Káva' }] } },
    )

    const card = await screen.findByRole('region', { name: 'Visí na vás' })
    const items = within(card).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByRole('button', { name: 'Otevřít Zásoby' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Chata je prázdná 20 dní')
    expect(card).not.toHaveTextContent('Na chatě dochází')
    fireEvent.click(within(card).getByRole('button', { name: 'Zobrazit víc (1)' }))
    expect(within(card).getAllByRole('listitem')).toHaveLength(3)
    expect(card).toHaveTextContent('Zítra jedeš na chatu')
    expect(within(card).getByRole('button', { name: 'Zobrazit méně' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('skryté upozornění zmizí a když nic nevisí, karta se nevykreslí', async () => {
    renderOverview(reservations({ lastStay: lastStay(20) }))

    const card = await screen.findByRole('region', { name: 'Visí na vás' })
    fireEvent.click(within(card).getByRole('button', { name: 'Skrýt' }))
    expect(screen.queryByRole('region', { name: 'Visí na vás' })).not.toBeInTheDocument()
  })
})
