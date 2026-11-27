import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AvatarPicker } from '@/components/shared/AvatarPicker'
import { AVATARS } from '@/lib/avatars'

/** Výběr avatara na tokenech (#526, DESIGN.md §7): každá volba je pojmenovaná a vybraná je stisknutá. */
describe('výběr avatara (#526)', () => {
  it.each([false, true])('pojmenuje každou volbu a vybraného avatara označí jako stisknutého (compact: %s)', (compact) => {
    const [first, second] = AVATARS
    render(<AvatarPicker value={second.id} onChange={vi.fn()} compact={compact} />)

    expect(screen.getAllByRole('button')).toHaveLength(AVATARS.length)
    expect(screen.getByRole('button', { name: second.label })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: first.label })).toHaveAttribute('aria-pressed', 'false')
  })
})
