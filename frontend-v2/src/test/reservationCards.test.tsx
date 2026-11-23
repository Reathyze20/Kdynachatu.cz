import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Reservation } from '@/api/reservations'
import { ReservationList } from '@/features/reservations/ui/ReservationList'
// `?raw` místo node:fs (není v typech tsconfig.app).
import reservationsCssRaw from '@/features/reservations/Reservations.module.css?raw'

// Karty turnusu v bočním panelu (#209, řez 2): avatar, účel, termín, kdo a typ
// pojmenovaný stejně jako ve formuláři (pevná / předběžná / záložní).

vi.mock('@/api/client', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: null })) } }))

const stays: Reservation[] = [
  { id: 'r-1', userId: 'u-petr', username: 'Petr', from: '2030-06-10', to: '2030-06-12', purpose: 'Víkend', status: 'primary' },
  { id: 'r-2', userId: 'u-jana', username: 'Jana', from: '2030-06-14', to: '2030-06-19', purpose: 'Sekání trávy', status: 'soft' },
  { id: 'r-3', userId: 'u-petr', username: 'Petr', from: '2030-06-20', to: '2030-06-21', purpose: 'Rybaření', status: 'backup' },
  { id: 'r-4', userId: 'u-jana', username: 'Jana', from: '2030-06-25', to: '2030-06-25', purpose: 'Odečet vody' },
]

function renderList() {
  const onShowDetail = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ReservationList reservations={stays} month={5} year={2030} onMonthChange={vi.fn()} onShowDetail={onShowDetail} />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), onShowDetail }
}

const card = (purpose: string) => screen.getByRole('button', { name: new RegExp(purpose) })

describe('reservation cards in the side panel', () => {
  it('names the type pevná / předběžná / záložní', () => {
    renderList()

    expect(within(card('Víkend')).getByText('Pevná')).toBeInTheDocument()
    expect(within(card('Sekání trávy')).getByText('Předběžná')).toBeInTheDocument()
    expect(within(card('Rybaření')).getByText('Záložní')).toBeInTheDocument()
    expect(screen.queryByText('Potvrzeno')).toBeNull()
    expect(screen.queryByText('Čeká')).toBeNull()
  })

  it('shows the dates with the number of nights and who is going', () => {
    renderList()

    const soft = card('Sekání trávy')
    expect(within(soft).getByText('14. 6. – 19. 6. · 5 nocí')).toBeInTheDocument()
    expect(within(soft).getByText('Jana')).toBeInTheDocument()
    expect(within(card('Rybaření')).getByText('20. 6. – 21. 6. · 1 noc')).toBeInTheDocument()
  })

  it('a stay without a status is pevná and a one-day stay shows no nights', () => {
    renderList()

    const oneDay = card('Odečet vody')
    expect(within(oneDay).getByText('Pevná')).toBeInTheDocument()
    expect(within(oneDay).getByText('25. 6. – 25. 6.')).toBeInTheDocument()
  })

  it('is a button, so the keyboard opens the detail too', async () => {
    const { user, onShowDetail } = renderList()

    card('Víkend').focus()
    await user.keyboard('{Enter}')

    expect(onShowDetail).toHaveBeenCalledWith(stays[0])
  })
})

describe('reservation card styles', () => {
  const css = reservationsCssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
  const body = (selector: string) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1].split(',').some((s) => s.trim() === selector))?.[2] ?? ''
  const prop = (selector: string, name: string) =>
    new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(body(selector))?.[1].trim()

  it.each(['.cardTitle', '.cardMeta', '.cardWho', '.typeBadge'])('%s takes its font size from the text tokens', (selector) => {
    expect(prop(selector, 'font-size')).toMatch(/^var\(--font-size-(sm|base)\)$/)
  })

  it.each([
    ['.typeFirm', '--ok'],
    ['.typeSoft', '--ok'],
    ['.typeBackup', '--low'],
  ])('%s takes its colour from the status token %s', (selector, token) => {
    expect(prop(selector, 'color')).toBe(`rgb(var(${token}))`)
  })

  it('a past stay dims only the avatar, so its text keeps the contrast', () => {
    expect(prop('.cardPast', 'opacity')).toBeUndefined()
    expect(prop('.cardPast .cardAvatar', 'opacity')).toBe('0.5')
  })

  it('a předběžná badge differs by shape too (outline), not only by colour', () => {
    expect(prop('.typeSoft', 'border')).toMatch(/dashed/)
    expect(prop('.typeFirm', 'border')).toMatch(/solid/)
  })
})
