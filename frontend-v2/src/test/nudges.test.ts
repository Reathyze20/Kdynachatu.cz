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

// #274: plyn je výzvou jen pro toho, kdo přijede příště, proto gas testy hrají za Tátu s příštím pobytem
const nextStay = { id: 'r2', userId: 'u1', username: 'Táta', userColor: null, userAnimalIcon: null, from: TOMORROW, to: '2026-07-18', purpose: 'Víkend', status: 'primary' }
const gasFor = (checkoutState: LastStay['checkoutState']) =>
  buildNudges({ reservations: reservations({ lastStay: lastStay({ checkoutState }), upcomingReservations: [nextStay] }), myUsername: 'Táta' })

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
    const ns = buildNudges({ reservations: reservations({ activeReservation: active({ to: TODAY, isCheckoutCompleted: false }) }), myUsername: 'Táta' })
    expect(ids(ns)).toContain('departure-r1')
  })

  it('prompts departure to a co-traveller whose shared stay ends today (#255)', () => {
    const participants = [{ userId: 'u2', username: 'Máma', userColor: null, userAnimalIcon: null }]
    const ns = buildNudges({ reservations: reservations({ activeReservation: active({ username: 'Táta', participants }) }), myUsername: 'Máma' })
    expect(ids(ns)).toContain('departure-r1')
  })

  it('does NOT prompt departure when the stay of another member ends today (#255)', () => {
    const ns = buildNudges({ reservations: reservations({ activeReservation: active({ username: 'Táta' }) }), myUsername: 'Máma' })
    expect(ids(ns).some((id) => id.startsWith('departure-'))).toBe(false)
  })

  it('does NOT prompt departure when the viewer is unknown (#255)', () => {
    const ns = buildNudges({ reservations: reservations({ activeReservation: active() }), myUsername: null })
    expect(ids(ns).some((id) => id.startsWith('departure-'))).toBe(false)
  })

  it('does NOT prompt departure when checkout already completed', () => {
    const ns = buildNudges({ reservations: reservations({ activeReservation: active({ to: TODAY, isCheckoutCompleted: true }) }), myUsername: 'Táta' })
    expect(ids(ns).some((id) => id.startsWith('departure-'))).toBe(false)
  })

  it('does NOT prompt departure when the stay ends in the future', () => {
    const ns = buildNudges({ reservations: reservations({ activeReservation: active({ to: TOMORROW, isCheckoutCompleted: false }) }), myUsername: 'Táta' })
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
    expect(supply?.href).toBe('/shopping?view=pantry')
    expect(supply?.whatsapp).toContain('Na chatě dochází')
  })

  it('warns when the last checkout reported gas low or empty', () => {
    const low = gasFor({ gas: 'low' })
    expect(low.find((n) => n.id.startsWith('gas-'))?.title).toBe('Plynová bomba: Dochází')
    expect(low.find((n) => n.id.startsWith('gas-'))?.href).toBe('/shopping?view=pantry')

    const empty = gasFor({ gas: 'empty' })
    expect(empty.find((n) => n.id.startsWith('gas-'))?.whatsapp).toContain('Plynová bomba: Došlo')

    const full = gasFor({ gas: 'full' })
    expect(full.some((n) => n.id.startsWith('gas-'))).toBe(false)
  })

  it('gas nudge speaks the Plynová bomba vocabulary for every stored value (#166)', () => {
    const gasNudge = (gas?: 'full' | 'half' | 'low' | 'empty' | null) =>
      gasFor(gas === undefined ? {} : { gas }).find((n) => n.id.startsWith('gas-'))

    expect(gasNudge('low')?.whatsapp).toContain('Plynová bomba: Dochází')
    expect(gasNudge('empty')?.title).toBe('Plynová bomba: Došlo')
    expect(gasNudge('full')).toBeUndefined()
    expect(gasNudge('half')).toBeUndefined()
    expect(gasNudge(null)).toBeUndefined()
    expect(gasNudge()).toBeUndefined()
  })

  // #677/#274: výzva „Chata je prázdná ≥ 14 dní“ není pro nikoho konkrétního, proto zanikla (dřív od 14 dní)
  it('never prompts a long-empty cabin', () => {
    expect(buildNudges({ reservations: reservations({ lastStay: lastStay({ daysEmpty: 20 }) }) })).toEqual([])
  })
})
