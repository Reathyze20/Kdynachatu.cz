import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { NotesPage } from '@/features/notes/NotesPage'

// #518 (část 1): seznam témat chatu podle DESIGN.md – PageHeader s jediným h1 „Chat“ jako v navigaci,
// „Nové téma“ jako primární akce, témata jako tlačítka ovladatelná klávesnicí, Hlavní připnuté nahoře,
// vyhledávání s lupou a prázdný výsledek přes EmptyState.

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { userId: 'u-me', username: 'jana', role: 'user' }, isAdmin: false, isGuest: false }),
}))

const threads = [
  { id: null, name: 'Hlavní', createdById: null, createdAt: null, lastMessage: 'Starší', lastMessageAt: '2026-07-01T10:00:00.000Z' },
  { id: 't-kamna', name: 'Kamna', createdById: 'u-me', createdAt: '2026-07-01T10:00:00.000Z', lastMessage: 'Novější', lastMessageAt: '2026-07-03T10:00:00.000Z', hasUnread: true },
]

function stubViewport(mobile: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mobile && query === '(max-width: 768px)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function renderPage(channels: unknown = threads) {
  api.get.mockImplementation((url: string) => {
    if (url === '/channels') return channels === 'pending' ? new Promise(() => {}) : Promise.resolve({ data: channels })
    if (url.startsWith('/channels/')) return Promise.resolve({ data: { messages: [], nextCursor: null, hasMore: false } })
    return Promise.resolve({ data: [] })
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><MemoryRouter><NotesPage /></MemoryRouter></QueryClientProvider>)
  return userEvent.setup()
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  stubViewport(false)
})
afterEach(() => vi.unstubAllGlobals())

describe('chat topic list per DESIGN.md (#518)', () => {
  it('keeps the single h1 "Chat" with the "Nové téma" action while the topics load', () => {
    renderPage('pending')
    const [h1, ...rest] = screen.getAllByRole('heading', { level: 1 })
    expect(rest).toHaveLength(0)
    expect(h1).toHaveTextContent('Chat')
    expect(within(h1.closest('header') as HTMLElement).getByRole('button', { name: 'Nové téma' })).toBeInTheDocument()
  })

  it('topics are buttons reachable from the keyboard and Hlavní is pinned on top', async () => {
    const user = renderPage()
    const items = await screen.findAllByTestId('notes-thread-item')
    expect(items.map((i) => i.tagName)).toEqual(['BUTTON', 'BUTTON'])
    expect(items[0]).toHaveTextContent('Hlavní')
    expect(items[1]).toHaveTextContent('Kamna')

    items[1].focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Kamna' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kamna/, current: true })).toBe(items[1])
  })

  it('an unread topic says so in words, not only with a dot', async () => {
    renderPage()
    const kamna = (await screen.findAllByTestId('notes-thread-item'))[1]
    expect(kamna).toHaveAccessibleName(/nepřečtené/)
  })

  it('the search field shows a magnifier and an empty result uses EmptyState', async () => {
    renderPage()
    const search = await screen.findByRole('searchbox', { name: 'Hledat téma' })
    expect(search.parentElement?.querySelector('svg.lucide-search')).not.toBeNull()

    fireEvent.change(search, { target: { value: 'sauna' } })
    expect(screen.queryAllByTestId('notes-thread-item')).toHaveLength(0)
    expect(screen.getByText('Žádné téma neodpovídá hledání.')).toBeInTheDocument()
  })

  it('on mobile an open thread still leaves exactly one h1', async () => {
    stubViewport(true)
    renderPage()
    fireEvent.click((await screen.findAllByTestId('notes-thread-item'))[1])
    await screen.findByRole('heading', { name: 'Kamna' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
