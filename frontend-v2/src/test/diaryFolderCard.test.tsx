import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiaryFolders } from '@/features/diary/DiaryFolders'
import type { DiaryFolder } from '@/api/diary'

// Karta pobytu v Deníku (#259): žádný zástupný kroužek ○ a rozsah dat i s rokem,
// aby šlo v deníku přes víc let poznat, kdy pobyt byl.

function folder(id: string, startDate: string, endDate: string, activityTag: DiaryFolder['activityTag'] = null): DiaryFolder {
  return { id, name: `Pobyt ${id}`, startDate, endDate, activityTag, createdAt: '2025-01-01T10:00:00.000Z' }
}

function renderCards(folders: DiaryFolder[]) {
  render(
    <DiaryFolders folders={folders} onOpen={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} onNewFolder={vi.fn()} />,
  )
  return screen.getAllByTestId('diary-folder-card')
}

const datesOf = (card: HTMLElement) => card.querySelector('.folder-dates')?.textContent

describe('diary stay card (#259)', () => {
  it('shows no placeholder ○ icon, whatever the activity tag', () => {
    const cards = renderCards([folder('a', '2025-07-12', '2025-07-14', 'relax'), folder('b', '2025-08-01', '2025-08-03')])
    for (const card of cards) {
      expect(card.textContent).not.toContain('○')
      expect(card.querySelector('.folder-icon-large')).toBeNull()
    }
  })

  it('a stay within one month reads „12.–14. 7. 2025“', () => {
    const [card] = renderCards([folder('a', '2025-07-12', '2025-07-14')])
    expect(datesOf(card)).toBe('12.–14. 7. 2025')
  })

  it('a stay across a month boundary names both months and the year once', () => {
    const [card] = renderCards([folder('a', '2025-06-30', '2025-07-02')])
    expect(datesOf(card)).toBe('30. 6. – 2. 7. 2025')
  })

  it('a stay across New Year shows both years', () => {
    const [card] = renderCards([folder('a', '2025-12-30', '2026-01-02')])
    expect(datesOf(card)).toBe('30. 12. 2025 – 2. 1. 2026')
  })

  it('a one-day stay shows a single date with the year', () => {
    const [card] = renderCards([folder('a', '2025-07-12', '2025-07-12')])
    expect(datesOf(card)).toBe('12. 7. 2025')
  })

  it('the calendar day does not shift in a time zone west of UTC', () => {
    vi.stubEnv('TZ', 'America/New_York')
    try {
      const [card] = renderCards([folder('a', '2025-07-01', '2025-07-03')])
      expect(datesOf(card)).toBe('1.–3. 7. 2025')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
