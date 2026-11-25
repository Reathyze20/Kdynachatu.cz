import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotebookModal } from '@/features/diary/NotebookModal'
import type { DiaryEntry } from '@/api/diary'

const { api, showToast } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  showToast: vi.fn(),
}))
vi.mock('@/api/client', () => ({ default: api, apiClient: api }))
vi.mock('@/lib/toast', () => ({ showToast }))

const ALL_DATES = ['2027-07-10', '2027-07-11', '2027-07-12']
const DAY = new Date('2027-07-11T12:00:00')

function entry(content: string): DiaryEntry {
  return { id: 'e-1', folderId: 'f-1', date: '2027-07-11', content, galleryPhotoIds: [], createdAt: '2027-07-12T10:00:00.000Z' }
}

function renderNotebook(existing?: DiaryEntry) {
  const onNavigate = vi.fn()
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <NotebookModal
        dateObj={DAY}
        entry={existing}
        folderId="f-1"
        allDates={ALL_DATES}
        onNavigate={onNavigate}
        onClose={onClose}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  )
  return { onNavigate, onClose, onSaved }
}

const navigatedTo = (onNavigate: ReturnType<typeof vi.fn>) =>
  (onNavigate.mock.calls[0]?.[0] as Date | undefined)?.toISOString().slice(0, 10)

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: [] })
  api.post.mockImplementation((_url: string, body: { content: string }) =>
    Promise.resolve({ data: { ...entry(body.content), id: 'e-new' } }))
  api.put.mockImplementation((_url: string, body: { content: string }) =>
    Promise.resolve({ data: entry(body.content) }))
})

describe('zápisník deníku: listování dny (#503)', () => {
  it('z prázdného dne přejde na další den bez ukládání', async () => {
    const { onNavigate } = renderNotebook()

    fireEvent.click(screen.getByRole('button', { name: 'Další den' }))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1))
    expect(navigatedTo(onNavigate)).toBe('2027-07-12')
    expect(api.post).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('z nezměněného zápisu přejde na předchozí den bez ukládání a bez toastu', async () => {
    const { onNavigate } = renderNotebook(entry('Ráno mlha, odpoledne houby.'))

    fireEvent.click(screen.getByRole('button', { name: 'Předchozí den' }))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1))
    expect(navigatedTo(onNavigate)).toBe('2027-07-10')
    expect(api.put).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('změněný den při přechodu uloží a toast ukáže jednou', async () => {
    const { onNavigate } = renderNotebook()

    await userEvent.type(screen.getByTestId('diary-entry-textarea'), 'Přijeli jsme')
    fireEvent.click(screen.getByRole('button', { name: 'Další den' }))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/diary/entries', expect.objectContaining({ date: '2027-07-11', content: 'Přijeli jsme' }))
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Uloženo.', 'success')
  })

  it('zápis smazaný do prázdna neodešle a nepřejde, řekne proč', async () => {
    const { onNavigate } = renderNotebook(entry('Pršelo'))

    await userEvent.clear(screen.getByTestId('diary-entry-textarea'))
    fireEvent.click(screen.getByRole('button', { name: 'Další den' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/prázdn/i)
    expect(api.put).not.toHaveBeenCalled()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('Uložit bez změn jen zavře, nic neodešle', async () => {
    const { onSaved } = renderNotebook(entry('Pršelo'))

    fireEvent.click(screen.getByTestId('diary-save-entry-button'))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(api.put).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })
})

describe('zápisník deníku: zavření s neuloženým textem (#503)', () => {
  it('bez změn se zavře hned', () => {
    const { onClose } = renderNotebook(entry('Pršelo'))

    fireEvent.click(screen.getByTestId('modal-close-button'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Zavřít bez uložení?')).not.toBeInTheDocument()
  })

  it('se změněným textem se křížkem nejdřív zeptá; „Pokračovat v psaní“ text nechá', async () => {
    const { onClose } = renderNotebook()
    const textarea = screen.getByTestId('diary-entry-textarea')
    await userEvent.type(textarea, 'Rozdělaný zápis')

    fireEvent.click(screen.getAllByTestId('modal-close-button')[0])

    const dialog = (await screen.findByText('Zavřít bez uložení?')).closest('[role="dialog"]') as HTMLElement
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pokračovat v psaní' }))

    await waitFor(() => expect(screen.queryByText('Zavřít bez uložení?')).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    expect(textarea).toHaveValue('Rozdělaný zápis')
  })

  it('se změněným textem Esc zeptá a potvrzení zápisník zavře bez ukládání', async () => {
    const { onClose } = renderNotebook(entry('Pršelo'))
    await userEvent.type(screen.getByTestId('diary-entry-textarea'), ' celý den')

    fireEvent.keyDown(document, { key: 'Escape' })

    const dialog = (await screen.findByText('Zavřít bez uložení?')).closest('[role="dialog"]') as HTMLElement
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zavřít bez uložení' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(api.put).not.toHaveBeenCalled()
  })

  it('se změněným textem se klikem mimo zápisník zeptá a nezavře ho', async () => {
    const { onClose } = renderNotebook()
    await userEvent.type(screen.getByTestId('diary-entry-textarea'), 'Rozdělaný zápis')

    fireEvent.click(screen.getByTestId('modal-overlay'))

    expect(await screen.findByText('Zavřít bez uložení?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Esc v otevřeném potvrzení jen zavře potvrzení, zápisník zůstane', async () => {
    const { onClose } = renderNotebook()
    await userEvent.type(screen.getByTestId('diary-entry-textarea'), 'Rozdělaný zápis')
    fireEvent.keyDown(document, { key: 'Escape' })
    await screen.findByText('Zavřít bez uložení?')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByText('Zavřít bez uložení?')).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('diary-entry-textarea')).toHaveValue('Rozdělaný zápis')
  })
})
