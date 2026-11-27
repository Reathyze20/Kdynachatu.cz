import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DiaryPage } from '@/features/diary/DiaryPage'
import { DiaryFolders } from '@/features/diary/DiaryFolders'
import type { DiaryFolder } from '@/api/diary'

// Seznam pobytů a dialog „Nový pobyt“ podle DESIGN.md (#520). Data jsou fiktivní.

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-me', username: 'jana', role: 'user' } }) }))

function folder(id: string, startDate: string, endDate: string, createdAt: string): DiaryFolder {
  return { id, name: `Pobyt ${id}`, startDate, endDate, createdAt, createdBy: 'jana' }
}

function mockApi({ folders = [] as DiaryFolder[], reservations = [] as unknown[] } = {}) {
  api.get.mockImplementation((url: string) => {
    if (url === '/diary/folders') return Promise.resolve({ data: folders })
    if (url === '/reservations') return Promise.resolve({ data: { reservations } })
    return Promise.resolve({ data: [] })
  })
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><DiaryPage /></QueryClientProvider>)
}

const folderIds = (cards: HTMLElement[]) => cards.map(c => c.dataset.folderId)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Deník: seznam pobytů (#520)', () => {
  it('řadí pobyty podle termínu od nejnovějšího, ne podle data vytvoření; bez termínu na konci', () => {
    const folders = [
      folder('jaro', '2025-04-18', '2025-04-21', '2025-09-01T10:00:00.000Z'),
      folder('bez', '', '', '2025-12-01T10:00:00.000Z'),
      folder('leto', '2025-07-12', '2025-07-14', '2025-01-01T10:00:00.000Z'),
      folder('zima', '2024-12-27', '2024-12-30', '2025-10-01T10:00:00.000Z'),
    ]
    render(<DiaryFolders folders={folders} onOpen={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} onNewFolder={vi.fn()} />)
    expect(folderIds(screen.getAllByTestId('diary-folder-card'))).toEqual(['leto', 'jaro', 'zima', 'bez'])
  })

  it('karta pobytu jde otevřít z klávesnice', () => {
    const onOpen = vi.fn()
    const leto = folder('leto', '2025-07-12', '2025-07-14', '2025-01-01T10:00:00.000Z')
    render(<DiaryFolders folders={[leto]} onOpen={onOpen} onRename={vi.fn()} onDelete={vi.fn()} onNewFolder={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Pobyt leto/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(leto)
  })

  it('prázdný deník ukáže prázdný stav s akcí Nový pobyt', () => {
    const onNewFolder = vi.fn()
    render(<DiaryFolders folders={[]} onOpen={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} onNewFolder={onNewFolder} />)
    expect(screen.getByText('Zatím tu nejsou žádné pobyty.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nový pobyt' }))
    expect(onNewFolder).toHaveBeenCalledTimes(1)
  })

  it.each([['Letos', 'Letos tu zatím žádný pobyt není.'], ['Loni', 'Loni tu žádný pobyt není.']])(
    'filtr %s bez pobytů ukáže prázdný stav s akcí', (filter, message) => {
      const onNewFolder = vi.fn()
      const old = folder('stary', '2001-07-12', '2001-07-14', '2001-01-01T10:00:00.000Z')
      render(<DiaryFolders folders={[old]} onOpen={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} onNewFolder={onNewFolder} />)
      fireEvent.click(screen.getByRole('button', { name: filter }))
      expect(screen.getByRole('button', { name: filter })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText(message)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Nový pobyt' }))
      expect(onNewFolder).toHaveBeenCalledTimes(1)
    },
  )

  it('stránka má právě jedno h1 v seznamu i v pobytu a Zpět vede na seznam', async () => {
    mockApi({ folders: [folder('leto', '2025-07-12', '2025-07-14', '2025-01-01T10:00:00.000Z')] })
    renderPage()
    fireEvent.click(await screen.findByTestId('diary-folder-card'))
    await screen.findAllByTestId('diary-day-card')
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Pobyt leto'])
    fireEvent.click(screen.getByRole('button', { name: 'Zpět' }))
    expect(await screen.findByTestId('diary-folder-card')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Deník pobytů'])
  })
})

describe('Deník: dialog Nový pobyt (#520)', () => {
  async function openCreateDialog() {
    mockApi({
      folders: [],
      reservations: [
        { id: 'r-1', userId: 'u-me', username: 'jana', from: '2026-10-26', to: '2026-10-29', purpose: 'Podzimky' },
        { id: 'r-2', userId: 'u-other', username: 'petr', from: '2026-11-02', to: '2026-11-04', purpose: '' },
      ],
    })
    renderPage()
    const [headerAction] = await screen.findAllByRole('button', { name: 'Nový pobyt' })
    fireEvent.click(headerAction)
    return screen.findByRole('dialog', { name: 'Nový pobyt' })
  }

  it('termíny rezervací jsou v českém formátu, ne ISO', async () => {
    const dialog = await openCreateDialog()
    const select = await within(dialog).findByLabelText(/Načíst z rezervace/)
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2))
    const labels = within(select).getAllByRole('option').map(o => o.textContent)
    expect(labels[1]).toBe('26.–29. 10. (Podzimky)')
    expect(dialog.textContent).not.toContain('2026-10-26')
  })

  it('má tlačítko Zrušit, které dialog zavře', async () => {
    const dialog = await openCreateDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zrušit' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nový pobyt' })).toBeNull())
  })
})
