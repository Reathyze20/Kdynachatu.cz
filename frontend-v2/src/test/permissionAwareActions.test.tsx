import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { DiaryPage } from '@/features/diary/DiaryPage'
import { NotesPage } from '@/features/notes/NotesPage'
import { GalleryPage } from '@/features/gallery/GalleryPage'

// #507: člen nevidí akce, které mu server odmítne (403). Pravidlo jako na backendu: autor
// nebo správce. Hromadné mazání fotek hlásí, kolik server skutečně smazal.

const { api, auth, toast } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  auth: { role: 'user' as 'admin' | 'user' },
  toast: vi.fn(),
}))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: toast }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { userId: 'u-me', username: 'jana', role: auth.role }, isAdmin: auth.role === 'admin', isGuest: false }),
}))

function renderPage(page: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}>{page}</QueryClientProvider>)
}

function mockGet(routes: Record<string, unknown>) {
  api.get.mockImplementation((url: string) => {
    const key = Object.keys(routes).find((k) => url === k || (k.endsWith('*') && url.startsWith(k.slice(0, -1))))
    return Promise.resolve({ data: key ? routes[key] : [] })
  })
}

const byData = (els: HTMLElement[], key: string, value: string) => els.find((e) => e.dataset[key] === value)!

beforeEach(() => {
  vi.clearAllMocks()
  auth.role = 'user'
})

describe('Deník: úprava a smazání pobytu (#507)', () => {
  beforeEach(() => mockGet({
    '/diary/folders': [
      { id: 'f-mine', name: 'Můj', startDate: '2026-07-01', endDate: '2026-07-03', createdAt: '2026-07-01T10:00:00.000Z', createdBy: 'jana' },
      { id: 'f-other', name: 'Cizí', startDate: '2026-08-01', endDate: '2026-08-03', createdAt: '2026-08-01T10:00:00.000Z', createdBy: 'petr' },
    ],
    '/reservations': { reservations: [] },
  }))

  it.each([
    ['user', 'f-mine', true], ['user', 'f-other', false], ['admin', 'f-other', true],
  ] as const)('%s u pobytu %s vidí Přejmenovat a Smazat: %s', async (role, id, visible) => {
    auth.role = role
    renderPage(<DiaryPage />)
    const card = byData(await screen.findAllByTestId('diary-folder-card'), 'folderId', id)
    for (const name of ['Přejmenovat', 'Smazat']) {
      expect(within(card).queryByRole('button', { name }) !== null).toBe(visible)
    }
  })
})

describe('Chat: smazání tématu (#507)', () => {
  const threads = [
    { id: null, name: 'Hlavní', createdById: null, createdAt: null },
    { id: 't-mine', name: 'Moje téma', createdById: 'u-me', createdAt: '2026-07-01T10:00:00.000Z' },
    { id: 't-other', name: 'Cizí téma', createdById: 'u-petr', createdAt: '2026-07-01T10:00:00.000Z' },
  ]
  beforeEach(() => {
    mockGet({ '/channels': threads, '/channels/*': { messages: [], nextCursor: null, hasMore: false } })
    api.post.mockResolvedValue({ data: {} })
  })

  async function openThread(id: string) {
    renderPage(<NotesPage />)
    fireEvent.click(byData(await screen.findAllByTestId('notes-thread-item'), 'threadId', id))
    await screen.findByRole('heading', { name: threads.find((t) => t.id === id)!.name })
  }

  it.each([
    ['user', 't-mine', true], ['user', 't-other', false], ['admin', 't-other', true],
  ] as const)('%s u tématu %s může smazat téma: %s', async (role, id, allowed) => {
    auth.role = role
    await openThread(id)
    const menu = screen.queryByRole('button', { name: 'Akce tématu' })
    expect(menu !== null).toBe(allowed)
    if (menu) {
      fireEvent.click(menu)
      expect(screen.getByRole('button', { name: 'Smazat téma' })).toBeInTheDocument()
    }
  })

  it('odmítnuté smazání tyká a mluví o tématu, ne o záložce ani kanálu', async () => {
    auth.role = 'admin'
    api.delete.mockRejectedValue(Object.assign(new Error('Forbidden'), { isAxiosError: true, response: { status: 403, data: {} } }))
    await openThread('t-other')
    fireEvent.click(screen.getByRole('button', { name: 'Akce tématu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Smazat téma' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Smazat' }))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    const messages = [...toast.mock.calls.map(([m]) => String(m)), ...screen.queryAllByRole('alert').map((a) => a.textContent ?? '')]
    for (const m of messages) expect(m).not.toMatch(/záložk|kanál/i)
    expect(messages).toContain('Téma může smazat jen ten, kdo ho založil, nebo správce.')
  })
})

describe('Galerie: smazání alba a hromadné mazání fotek (#507)', () => {
  const photo = (id: string, uploadedBy: string) => ({ id, src: `/uploads/${id}.jpg`, folderId: 'g-other', createdAt: '2026-07-02T10:00:00.000Z', uploadedBy })
  beforeEach(() => mockGet({
    '/gallery/folders': [
      { id: 'g-mine', name: 'Moje album', photoCount: 3, createdAt: '2026-07-01T10:00:00.000Z', createdBy: 'jana' },
      { id: 'g-other', name: 'Cizí album', photoCount: 3, createdAt: '2026-07-02T10:00:00.000Z', createdBy: 'petr' },
      { id: 'g-empty', name: 'Prázdné cizí', photoCount: 0, createdAt: '2026-07-03T10:00:00.000Z', createdBy: 'petr' },
    ],
    '/gallery/photos*': [photo('p-1', 'jana'), photo('p-2', 'petr'), photo('p-3', 'jana')],
  }))

  it.each([
    ['user', 'Cizí album', false], ['user', 'Moje album', true], ['user', 'Prázdné cizí', true], ['admin', 'Cizí album', true],
  ] as const)('%s u alba „%s“ vidí Smazat: %s', async (role, name, visible) => {
    auth.role = role
    renderPage(<GalleryPage />)
    fireEvent.click(await screen.findByRole('button', { name: `Akce pro album ${name}` }))
    expect(screen.getByRole('button', { name: /Přejmenovat/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Smazat/ }) !== null).toBe(visible)
  })

  async function selectAllAndDelete(deleted: number) {
    api.delete.mockResolvedValue({ data: { message: `Smazáno ${deleted} fotek.`, deleted } })
    renderPage(<GalleryPage />)
    fireEvent.click(byData(await screen.findAllByTestId('gallery-folder-card'), 'folderId', 'g-other'))
    await screen.findAllByTestId('gallery-photo-card')
    fireEvent.click(screen.getByRole('button', { name: /Vybrat/ }))
    const p2 = () => byData(screen.getAllByTestId('gallery-photo-card'), 'photoId', 'p-2')
    fireEvent.click(p2())
    const p2Selectable = p2().getAttribute('aria-selected') === 'true'
    if (p2Selectable) fireEvent.click(p2())
    expect(p2().getAttribute('aria-disabled') === 'true').toBe(!p2Selectable)
    fireEvent.click(screen.getByTitle('Vybrat vše'))
    const selected = screen.getByText(/\d+ vybráno/).textContent
    fireEvent.click(screen.getByTitle('Smazat vybrané'))
    fireEvent.click(await screen.findByRole('button', { name: 'Smazat' }))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    return { p2Selectable, selected }
  }

  it('člen nevybere cizí fotku, Vybrat vše vybere jen jeho a server smaže všechny vybrané', async () => {
    expect(await selectAllAndDelete(2)).toEqual({ p2Selectable: false, selected: '2 vybráno' })
    expect(api.delete).toHaveBeenCalledWith('/gallery/photos', { data: { photoIds: ['p-1', 'p-3'] } })
    expect(toast).toHaveBeenCalledWith('Fotky smazány.', 'success')
  })

  it('když server smaže méně fotek, než se vybralo, hláška to řekne pravdivě', async () => {
    await selectAllAndDelete(1)
    expect(toast).toHaveBeenCalledWith('Smazáno 1 z 2, ostatní nejsou tvoje.', 'info')
    expect(toast).not.toHaveBeenCalledWith('Fotky smazány.', 'success')
  })

  it('správce vybere i cizí fotky', async () => {
    auth.role = 'admin'
    expect(await selectAllAndDelete(3)).toEqual({ p2Selectable: true, selected: '3 vybráno' })
  })
})
