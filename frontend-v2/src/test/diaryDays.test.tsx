import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { DiaryCalendar } from '@/features/diary/DiaryCalendar'
import { NotebookModal } from '@/features/diary/NotebookModal'
import type { DiaryEntry, DiaryFolder } from '@/api/diary'

// Pobyt po dnech a zápisník podle DESIGN.md (#520). Data jsou fiktivní.

const { api, showToast } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  showToast: vi.fn(),
}))
vi.mock('@/api/client', () => ({ default: api, apiClient: api }))
vi.mock('@/lib/toast', () => ({ showToast }))

const folder: DiaryFolder = { id: 'f-1', name: 'Léto', startDate: '2027-07-10', endDate: '2027-07-11', createdAt: '2027-07-01T10:00:00.000Z' }

function entry(date: string, content: string, galleryPhotoIds: string[] = []): DiaryEntry {
  return { id: `e-${date}`, folderId: 'f-1', date, content, galleryPhotoIds, createdAt: '2027-07-12T10:00:00.000Z' }
}

function renderWithQuery(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: [] })
  api.delete.mockResolvedValue({ data: {} })
})

describe('Deník: pobyt po dnech (#520)', () => {
  it('den se zápisem s fotkami má ikonu s přístupným popisem místo „•“', () => {
    // Klíč dne závisí na časové zóně (#185), proto zápis pod každým klíčem, který může vyjít.
    const entries = ['2027-07-09', '2027-07-10', '2027-07-11'].map(d => entry(d, `Koupali jsme se ${d}`, ['p-1']))
    render(<DiaryCalendar folder={folder} entries={entries} onOpenNotebook={vi.fn()} />)
    const day = screen.getAllByTestId('diary-day-card')[0]
    expect(day.textContent).toContain('Koupali jsme se')
    expect(day.textContent).not.toContain('•')
    expect(within(day).getByRole('img', { name: 'Zápis má fotky' })).toBeInTheDocument()
  })

  it('každý den je tlačítko, které otevře zápisník toho dne', () => {
    const onOpenNotebook = vi.fn()
    render(<DiaryCalendar folder={folder} entries={[]} onOpenNotebook={onOpenNotebook} />)
    const days = screen.getAllByRole('button')
    expect(days).toHaveLength(2)
    fireEvent.click(days[1])
    expect(onOpenNotebook).toHaveBeenCalledTimes(1)
  })

  it('pobyt bez termínu ukáže prázdný stav', () => {
    render(<DiaryCalendar folder={{ ...folder, startDate: '', endDate: '' }} entries={[]} onOpenNotebook={vi.fn()} />)
    expect(screen.getByText('Pobyt nemá nastavený termín.')).toBeInTheDocument()
    expect(screen.queryAllByTestId('diary-day-card')).toHaveLength(0)
  })
})

describe('Deník: zápisník (#520)', () => {
  function renderNotebook(existing?: DiaryEntry) {
    const onSaved = vi.fn()
    renderWithQuery(
      <NotebookModal
        dateObj={new Date('2027-07-11T12:00:00')}
        entry={existing}
        folderId="f-1"
        allDates={['2027-07-10', '2027-07-11']}
        onNavigate={vi.fn()}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )
    return { onSaved }
  }

  it('Uložit je primární tlačítko', () => {
    renderNotebook()
    expect(screen.getByRole('button', { name: 'Uložit' })).toHaveClass('bg-primary')
  })

  it('„Smazat zápis“ se nejdřív zeptá a smaže až po potvrzení', async () => {
    const { onSaved } = renderNotebook(entry('2027-07-11', 'Pršelo'))
    expect(screen.queryByRole('button', { name: 'Vytrhnout' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Smazat zápis' }))

    const dialog = await screen.findByRole('dialog', { name: 'Smazat zápis?' })
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Smazat' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/diary/entries/e-2027-07-11'))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(showToast).toHaveBeenCalledWith('Zápis smazán.', 'success')
  })

  it('nový den „Smazat zápis“ nenabízí', () => {
    renderNotebook()
    expect(screen.queryByRole('button', { name: 'Smazat zápis' })).toBeNull()
  })
})
