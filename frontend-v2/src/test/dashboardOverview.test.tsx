import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { CabinToday } from '@/features/dashboard/CabinToday'
import { DesktopSidebar } from '@/components/layout/DesktopSidebar'
import apiClient from '@/api/client'
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
  },
}))
vi.mock('@/api/dashboard', () => ({ fetchWeather: vi.fn(() => Promise.resolve(weather.current)) }))
const { auth } = vi.hoisted(() => ({ auth: { isAdmin: false } }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-eva', cabinId: 'c-1', username: 'Eva' }, isAdmin: auth.isAdmin }),
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

function renderOverview(data: DashboardReservationsData, shopping: DashboardShoppingData = NO_SHOPPING, cabin: Partial<CabinSettings> = {}) {
  responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [], ...cabin })
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
})

const NOVAKOVI_NOW = {
  id: 'r-now', username: 'Novákovi', userColor: null, userAnimalIcon: null,
  from: '2026-12-08', to: '2026-12-12', purpose: 'Víkend', handoverNote: null, isCheckoutCompleted: false,
}

describe('Přehled: hlavička teď → příště (#272)', () => {
  // #366: hlavička je osa teď → příště → pak; účel a spolucestující z ní zmizely (změna zadání #272).
  it('teď, příště a pak jsou sloupce v jedné kartě s avatarem, jménem a jedním řádkem „kdy“', async () => {
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
    const later = within(header).getByRole('group', { name: 'Pak' })
    expect(later).toHaveTextContent(/Ty\s*od po 28\. 12\./)
    expect(screen.queryByRole('group', { name: 'Řetězec turnusu' })).not.toBeInTheDocument()
    expect(document.body.textContent?.match(/14\. 12\./g)).toHaveLength(1)
    expect(screen.queryByText(/Tvůj pobyt/)).not.toBeInTheDocument()
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

    const header = await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(within(header).getByText('Od minule — Jana')).toBeInTheDocument()
    const items = (name: string) => within(within(header).getByRole('list', { name })).getAllByRole('listitem').map((li) => li.textContent)
    expect(items('Stav chaty')).toEqual(['Plynová bomba: Dochází', 'Topení vypnuté', 'Voda uzavřená'])
    expect(items('Vzkazy')).toEqual(['Rozbité: Kape kohoutek.', 'Nechal/a: Dřevo u kamen.', 'Poznámka: Past na myši.'])
  })

  it('když po aktuálním pobytu nic není, vpravo je „Zatím nikdo“', async () => {
    renderOverview(reservations({ activeReservation: NOVAKOVI_NOW }))

    const header = await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(within(header).getByRole('group', { name: 'Příště' })).toHaveTextContent('Zatím nikdo')
    expect(within(header).queryByRole('group', { name: 'Pak' })).not.toBeInTheDocument()
  })

  it('sloupec „Pak“ ukáže první další pevný pobyt a počet dalších za ním', async () => {
    renderOverview(reservations({
      upcomingReservations: [
        upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-16'),
        upcoming('r-petr', 'Petr', '2026-12-20', '2026-12-22'),
        upcoming('r-ota', 'Ota', '2026-12-20', '2026-12-21'),
        upcoming('r-ida', 'Ida', '2027-01-02', '2027-01-04'),
      ],
    }))

    const header = await screen.findByRole('region', { name: 'Na chatě teď' })
    const later = within(header).getByRole('group', { name: 'Pak' })
    expect(later).toHaveTextContent(/Ota\s*od ne 20\. 12\.\s*\+2/)
    expect(later).not.toHaveTextContent('a víc')
  })

  it('když API pošle plný seznam pěti pobytů, „Pak“ přizná, že jich může být víc', async () => {
    renderOverview(reservations({
      upcomingReservations: ['14', '16', '18', '20', '22'].map((day, i) => upcoming(`r-${i}`, `Host${i}`, `2026-12-${day}`, `2026-12-${Number(day) + 1}`)),
    }))

    const header = await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(within(header).getByRole('group', { name: 'Pak' })).toHaveTextContent(/Host1\s*od st 16\. 12\.\s*\+3 a víc/)
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

describe('Přehled: boční panel s lehkým kontextem (#172)', () => {
  it('vzkaz je v bočním panelu, celá karta počasí na Přehledu není, bez dalšího pobytu karta příjezdu chybí', async () => {
    renderOverview(reservations())

    const aside = await screen.findByRole('complementary', { name: 'Kontext chaty' })
    expect(within(aside).getByTestId('dashboard-handover-widget')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-weather-widget')).not.toBeInTheDocument()
    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByRole('region', { name: 'Další příjezd' })).not.toBeInTheDocument()
  })
})

describe('Přehled: „Potřebuje pozornost“ (#275)', () => {
  // Pořadí (Došlo před Dochází, ★ napřed) dává server, tady už seřazené
  const supply = (name: string, isEmpty = false): AttentionItem =>
    ({ name, isEmpty, isEssential: false, inventoryId: `inv-${name}`, shoppingItemId: null })
  const starItem = (name: string): AttentionItem => ({ name, isEmpty: false, isEssential: true, inventoryId: null, shoppingItemId: `s-${name}` })
  const FAULT = { text: 'Kape kohoutek', reportedBy: 'Petr', reportedAt: '2026-11-15T12:00:00.000Z' }
  const withAttention = (...attention: AttentionItem[]): DashboardShoppingData => ({ ...NO_SHOPPING, attention })

  it('nahradí kartu „Dochází“: tři řádky, závada s autorem a datem, souhrn do Zásob', async () => {
    renderOverview(reservations({ lastFault: FAULT }), withAttention(supply('Toaleťák', true), supply('Káva'), supply('Sůl'), supply('Mléko')))

    const card = await screen.findByRole('region', { name: 'Potřebuje pozornost' })
    expect(screen.getByTestId('dashboard-page')).toContainElement(card)
    const rows = within(card).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual(['DošloToaleťákKoupím já', 'DocházíKávaKoupím já', 'ZávadaKape kohoutek · Petr 15. 11.'])
    expect(within(card).getByRole('link', { name: '+ 2 další potřebují pozornost' })).toHaveAttribute('href', '/shopping')
    expect(screen.queryByRole('region', { name: 'Dochází' })).not.toBeInTheDocument()
    expect(screen.queryByText('K nakoupení')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Otevřít nákupy' })).not.toBeInTheDocument()
  })

  it('na desktopu je v bočním panelu', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1024px)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      renderOverview(reservations(), withAttention(supply('Káva')))
      const aside = await screen.findByRole('complementary', { name: 'Kontext chaty' })
      expect(await within(aside).findByRole('region', { name: 'Potřebuje pozornost' })).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('„Koupím já“ u zásoby pošle slib přes zásobu, u ★ položky přes „Přivezu z domova“, řádek hned zmizí', async () => {
    renderOverview(reservations(), withAttention(supply('Toaleťák', true), starItem('Baterky'), supply('Káva')))

    const card = await screen.findByRole('region', { name: 'Potřebuje pozornost' })
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

    const card = await screen.findByRole('region', { name: 'Potřebuje pozornost' })
    fireEvent.click(within(card).getByRole('button', { name: 'Koupím já: Toaleťák' }))
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/inventory/inv-Toaleťák/pledge'))
    expect(await within(card).findByText('Toaleťák')).toBeInTheDocument()
  })

  it('„Zkopírovat pro WhatsApp“ zkopíruje všechny věci i za souhrnem', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderOverview(reservations(), withAttention(supply('D', true), supply('A'), supply('B'), supply('C')))

    const card = await screen.findByRole('region', { name: 'Potřebuje pozornost' })
    fireEvent.click(within(card).getByRole('button', { name: 'Zkopírovat pro WhatsApp' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      `Na chatě potřebuje pozornost:\n- Došlo: D\n- Dochází: A\n- Dochází: B\n- Dochází: C\n${window.location.origin}/shopping`,
    ))
  })

  it('když nic nepotřebuje pozornost, karta se nevykreslí', async () => {
    renderOverview(reservations())

    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByRole('region', { name: 'Potřebuje pozornost' })).not.toBeInTheDocument()
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

  it('když se nic neděje, je místo karty stavu pozvánka se slotem na ilustraci a tlačítkem „Zabrat termín“', async () => {
    renderOverview(reservations())

    const invite = await screen.findByRole('region', { name: 'Chata zatím čeká' })
    expect(within(invite).getByText('Zaber termín a rozjeď to.')).toBeInTheDocument()
    expect(within(invite).getByTestId('overview-invite-media')).toBeInTheDocument()
    expect(within(invite).getByRole('button', { name: 'Zabrat termín' })).toBeInTheDocument()
  })

  it('s plánovaným pobytem pozvánka není', async () => {
    renderOverview(reservations({ upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-28', '2026-12-30')] }))

    await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(screen.queryByRole('region', { name: 'Chata zatím čeká' })).not.toBeInTheDocument()
  })
})

describe('Desktop: dnešek chaty v hlavičce levého menu (#338)', () => {
  function renderSidebar(cabin: Partial<CabinSettings> = {}) {
    responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [], ...cabin })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <DesktopSidebar onOpenProfileDrawer={vi.fn()} today={<CabinToday variant="sidebar" />} />
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

  it('upozornění je v hlavním sloupci jako karta, první má tlačítko, které vede rovnou do úkolu', async () => {
    renderOverview(reservations({ lastStay: lastStay(20) }))

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    expect(screen.getByTestId('dashboard-page')).toContainElement(card)
    expect(card).toHaveTextContent('Chata je prázdná 20 dní')
    expect(within(card).getByRole('button', { name: 'Otevřít kalendář' })).toBeInTheDocument()
  })

  it('upozornění s akcí jdou napřed, vidět jsou nejvýš dvě, zbytek je za „Zobrazit víc“, zásoby jen v kartě „Dochází“', async () => {
    renderOverview(
      reservations({ myNextReservation: { from: '2026-12-11', to: '2026-12-13', purpose: 'Víkend' }, lastStay: lastStay(20, 'empty') }),
      { ...NO_SHOPPING, totalPendingShoppingCount: 1, essentialWarning: { count: 1, items: [{ name: 'Káva' }] } },
    )

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
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

  it('upozornění pro rodinu má tlačítko s textem „Zkopírovat pro WhatsApp“, které zkopíruje zprávu s odkazem (#264)', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderOverview(reservations({ lastStay: lastStay(20) }))

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    const copy = within(card).getByRole('button', { name: 'Zkopírovat pro WhatsApp' })
    expect(copy).toHaveTextContent('Zkopírovat pro WhatsApp')
    fireEvent.click(copy)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`Na chatě už 20 dní nikdo nebyl\\. Nezajedeme\\?\\n${window.location.origin}/reservations$`)),
    ))
    expect(await within(card).findByRole('button', { name: 'Zkopírováno' })).toBeInTheDocument()
  })

  // Přehled bez scrollování na desktopu (#356): hlavní sloupec nese stav pobytu, akce jdou do bočního panelu
  const oneAttentionRow: DashboardShoppingData = {
    ...NO_SHOPPING,
    attention: [{ name: 'Káva', isEmpty: false, isEssential: false, inventoryId: 'inv-k', shoppingItemId: null }],
  }

  it('na desktopu je v bočním panelu nad „Potřebuje pozornost“, v hlavním sloupci není (#356)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1024px)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      renderOverview(reservations({ lastStay: lastStay(20) }), oneAttentionRow)
      const aside = await screen.findByRole('complementary', { name: 'Kontext chaty' })
      const card = await within(aside).findByRole('region', { name: 'Visí na tobě' })
      const attention = within(aside).getByRole('region', { name: 'Potřebuje pozornost' })
      expect(screen.getByTestId('dashboard-page')).not.toContainElement(card)
      expect(card.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('na mobilu zůstává nahoře v hlavním sloupci před „Potřebuje pozornost“ a „Na chatě teď“ (#356)', async () => {
    renderOverview(reservations({ lastStay: lastStay(20), upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-14', '2026-12-17')] }), oneAttentionRow)

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    const page = screen.getByTestId('dashboard-page')
    expect(page).toContainElement(card)
    const order = within(page).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(order.indexOf('Visí na tobě')).toBeLessThan(order.indexOf('Potřebuje pozornost'))
    expect(order.indexOf('Potřebuje pozornost')).toBeLessThan(order.indexOf('Na chatě teď'))
  })

  it('skryté upozornění zmizí a když nic nevisí, karta se nevykreslí', async () => {
    renderOverview(reservations({ lastStay: lastStay(20) }))

    const card = await screen.findByRole('region', { name: 'Visí na tobě' })
    fireEvent.click(within(card).getByRole('button', { name: 'Skrýt' }))
    expect(screen.queryByRole('region', { name: 'Visí na tobě' })).not.toBeInTheDocument()
  })
})
