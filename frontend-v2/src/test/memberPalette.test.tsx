import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MEMBER_PALETTE, memberInitial, toMemberColor } from '@/lib/memberPalette'
import { AnimalAvatar } from '@/components/shared/AnimalAvatar'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { CalendarGrid } from '@/features/reservations/calendar/CalendarGrid'
import type { Reservation, UserAvailability } from '@/api/reservations'

/** Paleta barev členů (#271, G4): 8 ověřených barev, bílá iniciála ≥ 4,5 : 1, barva nikdy sama. */

function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05)
}

describe('member palette', () => {
  it('offers exactly the 8 verified colors, each with a white initial at 4.5:1 or more', () => {
    expect(MEMBER_PALETTE.map((c) => `${c.hex} ${c.name}`)).toEqual([
      '#1D5FA8 modrá', '#B3401A cihlová', '#7A3FA0 fialová', '#1F6F4A jedlová',
      '#0E6F7C petrolejová', '#8A5A00 okrová', '#A6306A vínová', '#4B5563 břidlicová',
    ])
    for (const { hex, name } of MEMBER_PALETTE) expect(contrastWithWhite(hex), name).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps palette colors as they are, in any letter case', () => {
    for (const { hex } of MEMBER_PALETTE) expect(toMemberColor(hex.toLowerCase())).toBe(hex)
  })

  it.each([
    ['#2d6a4f', '#1F6F4A'], ['#52b788', '#1F6F4A'], // zelené ze staré palety → jedlová
    ['#bf6c3d', '#B3401A'], ['#c1877a', '#B3401A'], // terakota, zaprášená růžová → cihlová
    ['#c68b3f', '#8A5A00'], ['#7a5b42', '#8A5A00'], // jantarová, hnědá → okrová
    ['#6b7280', '#4B5563'], ['#808080', '#4B5563'], // šedé → břidlicová
    ['#FFB300', '#8A5A00'], ['#AB47BC', '#7A3FA0'], ['#42A5F5', '#1D5FA8'], ['#66BB6A', '#1F6F4A'], // výchozí a seed
    ['#f80', '#B3401A'], // zkrácený zápis
  ])('maps the off-palette color %s to the nearest palette color %s', (stored, shown) => {
    expect(toMemberColor(stored)).toBe(shown)
  })

  it('falls back to slate for a missing or invalid color', () => {
    for (const bad of [null, undefined, '', 'var(--text-muted)']) expect(toMemberColor(bad)).toBe('#4B5563')
  })

  it('takes the first letter of the name as the initial', () => {
    expect([memberInitial('petr'), memberInitial('  Šárka '), memberInitial(''), memberInitial(null)]).toEqual(['P', 'Š', '?', '?'])
  })
})

describe('member color is never alone (G4)', () => {
  it('shows a white initial on the palette color when the member has no avatar', () => {
    render(<AnimalAvatar icon={null} username="eva" color="#c1877a" size={32} />)
    const avatar = screen.getByTitle('eva')
    expect(avatar).toHaveTextContent('E')
    expect(avatar).toHaveStyle({ backgroundColor: 'rgb(179, 64, 26)', color: 'var(--text-on-primary)' })
  })

  it('names every swatch in the color picker and marks the mapped stored color as chosen', () => {
    render(<ColorPicker value="#2d6a4f" onChange={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'jedlová' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'modrá' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('labels every week row of a calendar bar and every vacation dot', () => {
    const stay = { id: 'r1', userId: 'u2', username: 'petr', userColor: '#bf6c3d', from: '2026-05-08', to: '2026-05-13', purpose: 'Víkend', status: 'primary' } as Reservation
    const vacation = { id: 'a1', userId: 'u3', username: 'eva', userColor: '#AB47BC', startDate: '2026-05-20', endDate: '2026-05-20' } as UserAvailability
    const noop = vi.fn()
    const { container } = render(
      <CalendarGrid month={4} year={2026} reservations={[stay]} availabilities={[vacation]} currentUserId="u1"
        selectedDay={null} rangeStart={null} onGoToPrev={noop} onGoToNext={noop} onRangeStartSet={noop} onRangeClear={noop}
        onRangeComplete={noop} onShowDetail={noop} onShowMonthList={noop} onDaySelect={noop} />,
    )
    const bar = (date: string) => container.querySelector(`[data-date="${date}"] [title^="petr"]`)
    // začátek pobytu (pátek) a první den dalšího týdne (pondělí) nesou jméno i iniciálu, uprostřed týdne pruh navazuje
    expect(bar('2026-05-08')).toHaveTextContent('petrP')
    expect(bar('2026-05-11')).toHaveTextContent('petrP')
    expect(bar('2026-05-09')).not.toHaveTextContent('petr')

    const dot = container.querySelector('[data-date="2026-05-20"] [title="Mají dovolenou: eva"] div')
    expect(dot).toHaveTextContent('E')
    expect(dot).toHaveStyle({ backgroundColor: 'rgb(122, 63, 160)' })
  })
})
