import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { buildNudges } from '@/features/dashboard/nudges'
import type {
  ActiveReservation,
  DashboardReservationsData,
  DashboardShoppingData,
  LastStay,
} from '@/api/dashboard'

// Pin the clock at noon UTC so the nudge engine's UTC "today" and daysUntil's
// local midnight resolve to the same calendar day in any realistic CI timezone.
const NOW = new Date('2026-07-15T12:00:00Z')
const TODAY = '2026-07-15'
const TOMORROW = '2026-07-16'

function reservations(overrides: Partial<DashboardReservationsData> = {}): DashboardReservationsData {
  return {
    activeReservation: null,
    upcomingReservations: [],
    myNextReservation: null,
    departingToday: false,
    nextFreeWeekend: null,
    lastStay: null,
    stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
    ...overrides,
  }
}

function active(overrides: Partial<ActiveReservation> = {}): ActiveReservation {
  return {
    id: 'r1',
    username: 'Táta',
    userColor: null,
    userAnimalIcon: null,
    from: TODAY,
    to: TODAY,
    purpose: 'Víkend',
    handoverNote: null,
    isCheckoutCompleted: false,
    ...overrides,
  }
}

function lastStay(overrides: Partial<LastStay> = {}): LastStay {
  return {
    username: 'Máma',
    userColor: null,
    userAnimalIcon: null,
    from: '2026-06-01',
    to: '2026-06-03',
    isCheckoutCompleted: true,
    daysEmpty: 5,
    ...overrides,
  }
}

function shopping(overrides: Partial<DashboardShoppingData> = {}): DashboardShoppingData {
  return {
    pendingShoppingItems: [],
    totalPendingShoppingCount: 0,
    totalItemsCount: 0,
    essentialWarning: null,
    ...overrides,
  }
}

const ids = (ns: ReturnType<typeof buildNudges>) => ns.map((n) => n.id)

describe('buildNudges', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns nothing when there is no data', () => {
    expect(buildNudges({})).toEqual([])
    expect(buildNudges({ reservations: reservations(), shopping: shopping() })).toEqual([])
  })

  it('prompts to fill the state when departing today and checkout not done', () => {
    const ns = buildNudges({ reservations: reservations({ activeReservation: active({ to: TODAY, isCheckoutCompleted: false }) }) })
    expect(ids(ns)).toContain('departure-r1')
  })

  it('does NOT prompt departure when checkout already completed', () => {
    const ns = buildNudges({ reservations: reservations({ activeReservation: active({ to: TODAY, isCheckoutCompleted: true }) }) })
    expect(ids(ns).some((id) => id.startsWith('departure-'))).toBe(false)
  })

  it('does NOT prompt departure when the stay ends in the future', () => {
    const ns = buildNudges({ reservations: reservations({ activeReservation: active({ to: TOMORROW, isCheckoutCompleted: false }) }) })
    expect(ids(ns).some((id) => id.startsWith('departure-'))).toBe(false)
  })

  it('nudges the arrival briefing when my stay starts tomorrow', () => {
    const ns = buildNudges({ reservations: reservations({ myNextReservation: { from: TOMORROW, to: '2026-07-18', purpose: 'Dovolená' } }) })
    const arrival = ns.find((n) => n.id.startsWith('arrival-'))
    expect(arrival).toBeDefined()
    expect(arrival?.whatsapp).toContain('Zítra jedu na chatu')
  })

  it('folds low essential items into the arrival whatsapp message', () => {
    const ns = buildNudges({
      reservations: reservations({ myNextReservation: { from: TOMORROW, to: '2026-07-18', purpose: 'Dovolená' } }),
      shopping: shopping({ essentialWarning: { count: 2, items: [{ name: 'plyn' }, { name: 'kafe' }] } }),
    })
    const arrival = ns.find((n) => n.id.startsWith('arrival-'))
    expect(arrival?.whatsapp).toContain('plyn')
    expect(arrival?.whatsapp).toContain('kafe')
  })

  it('surfaces low essential supplies with a shareable message', () => {
    const ns = buildNudges({ shopping: shopping({ essentialWarning: { count: 2, items: [{ name: 'toaleťák' }, { name: 'plyn' }] } }) })
    const supply = ns.find((n) => n.id.startsWith('supply-'))
    expect(supply).toBeDefined()
    expect(supply?.detail).toContain('toaleťák')
    expect(supply?.href).toBe('/shopping')
    expect(supply?.whatsapp).toContain('Na chatě dochází')
  })

  it('warns when the last checkout reported gas low or empty', () => {
    const low = buildNudges({ reservations: reservations({ lastStay: lastStay({ checkoutState: { gas: 'low' } }) }) })
    expect(low.find((n) => n.id.startsWith('gas-'))?.title).toBe('Plynová bomba: Dochází')

    const empty = buildNudges({ reservations: reservations({ lastStay: lastStay({ checkoutState: { gas: 'empty' } }) }) })
    expect(empty.find((n) => n.id.startsWith('gas-'))?.whatsapp).toContain('Plynová bomba: Došlo')

    const full = buildNudges({ reservations: reservations({ lastStay: lastStay({ checkoutState: { gas: 'full' } }) }) })
    expect(full.some((n) => n.id.startsWith('gas-'))).toBe(false)
  })

  it('gas nudge speaks the Plynová bomba vocabulary for every stored value (#166)', () => {
    const gasNudge = (gas?: 'full' | 'half' | 'low' | 'empty' | null) =>
      buildNudges({ reservations: reservations({ lastStay: lastStay({ checkoutState: gas === undefined ? {} : { gas } }) }) })
        .find((n) => n.id.startsWith('gas-'))

    expect(gasNudge('low')?.whatsapp).toContain('Plynová bomba: Dochází')
    expect(gasNudge('empty')?.title).toBe('Plynová bomba: Došlo')
    expect(gasNudge('full')).toBeUndefined()
    expect(gasNudge('half')).toBeUndefined()
    expect(gasNudge(null)).toBeUndefined()
    expect(gasNudge()).toBeUndefined()
  })

  it('flags a long-empty cabin only past the 14-day threshold', () => {
    expect(buildNudges({ reservations: reservations({ lastStay: lastStay({ daysEmpty: 13 }) }) }).some((n) => n.id.startsWith('empty-'))).toBe(false)
    const ns = buildNudges({ reservations: reservations({ lastStay: lastStay({ daysEmpty: 20 }) }) })
    const empty = ns.find((n) => n.id.startsWith('empty-'))
    expect(empty?.title).toContain('20 dní')
  })
})
