import { act, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '@/api/client'
import { adminApi, type CabinUser, type Invite } from '@/api/admin'
import { LogsPanel } from '@/components/shared/LogsPanel'
import { OfflineBanner } from '@/components/shared/OfflineBanner'
import { AdminPage } from '@/features/admin/AdminPage'
import { enqueueMutation, flushQueue } from '@/lib/offlineQueue'
import { showToast } from '@/lib/toast'

// #509: počty ve správě a hlášky offline fronty skloňují podle počtu (1 / 2–4 / 5+),
// žádné „2 rezervací“ ani „změny/změn“. Fiktivní data, žádná reálná chata.
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, user: { id: 'u-admin', username: 'Správce' } }),
}))
vi.mock('@/features/admin/components/AdminSectionMenu', () => ({ AdminSectionMenu: () => null }))
vi.mock('@/features/admin/components/SystemStatsPanel', () => ({ SystemStatsPanel: () => null }))
vi.mock('@/features/settings/CabinSettingsPage', () => ({ CabinSettingsPanel: () => null }))

function queueChanges(count: number) {
  for (let i = 0; i < count; i += 1) {
    enqueueMutation({ method: 'post', url: '/shopping-lists', data: { name: `Seznam ${i}` }, headers: {} } as InternalAxiosRequestConfig)
  }
}

let onlineState = true
beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(showToast).mockClear()
  localStorage.clear()
  localStorage.setItem('userId', 'u-jana')
  localStorage.setItem('activeCabinId', 'cabin-1')
  onlineState = true
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => onlineState })
})

describe('offline banner skloňuje počet čekajících změn (#509)', () => {
  it.each([
    [2, '2 změny čekají na odeslání.'],
    [4, '4 změny čekají na odeslání.'],
    [5, '5 změn čeká na odeslání.'],
  ])('ve frontě: %i', (count, text) => {
    queueChanges(count)
    render(<OfflineBanner />)
    onlineState = false
    act(() => void window.dispatchEvent(new Event('offline')))

    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent(text)
    expect(banner.textContent).not.toContain('/')
  })
})

describe('hlášky po odeslání offline fronty skloňují počet (#509)', () => {
  function toastDetails() {
    return vi.mocked(showToast).mock.calls.map(([toast]) => (typeof toast === 'string' ? toast : toast.detail))
  }

  it.each([
    [2, '2 změny server odmítl — zkontroluj prosím data.'],
    [5, '5 změn server odmítl — zkontroluj prosím data.'],
  ])('odmítnuto: %i', async (count, text) => {
    vi.spyOn(apiClient, 'request').mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, null, { status: 409 } as AxiosResponse),
    )
    queueChanges(count)

    await flushQueue()

    expect(toastDetails()).toEqual([text])
  })

  it.each([
    [1, '1 změna provedená offline byla uložena na server.'],
    [2, '2 změny provedené offline byly uloženy na server.'],
    [5, '5 změn provedených offline bylo uloženo na server.'],
  ])('odesláno: %i', async (count, text) => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({ data: {} })
    queueChanges(count)

    await flushQueue()

    expect(toastDetails()).toEqual([text])
  })
})

describe('počty ve správě skloňují podle počtu (#509)', () => {
  const USER: CabinUser = {
    id: 'u-jana',
    username: 'Jana',
    role: 'user',
    animalIcon: null,
    avatarColor: null,
    email: 'jana@example.test',
    isVerified: true,
    isBanned: false,
    isActive: true,
    createdAt: '2026-01-10T10:00:00.000Z',
    reservationCount: 1,
    photoCount: 2,
    threadCount: 5,
  }
  const invite = (id: string): Invite => ({
    id,
    token: `tok-${id}`,
    role: 'guest',
    maxUses: 1,
    usedCount: 0,
    createdAt: '2026-11-20T10:00:00.000Z',
    expiresAt: '2099-12-31T10:00:00.000Z',
    cabinName: 'Chata U Lesa',
    createdBy: { username: 'Jana' },
  })

  function renderAdmin(path: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('metriky účtu: „1 rezervace“, „2 fotky“, „5 vláken“', async () => {
    vi.spyOn(adminApi, 'getUsers').mockResolvedValue([USER])
    vi.spyOn(adminApi, 'getInvites').mockResolvedValue([])
    renderAdmin('/admin')

    const card = await screen.findByTestId('admin-user-card')
    const metrics = within(card).getAllByText(/rezerva|fot|vlák/).map((node) => node.textContent)
    expect(metrics).toEqual(['1 rezervace', '2 fotky', '5 vláken'])
  })

  it('počítadlo pozvánek: „2 aktivní“', async () => {
    vi.spyOn(adminApi, 'getUsers').mockResolvedValue([])
    vi.spyOn(adminApi, 'getInvites').mockResolvedValue([invite('inv-1'), invite('inv-2')])
    renderAdmin('/admin/invites')

    expect(await screen.findByText('2 aktivní')).toBeInTheDocument()
  })
})

describe('počet záznamů v logu skloňuje podle počtu (#509)', () => {
  it.each([
    [1, '1 záznam'],
    [2, '2 záznamy'],
    [5, '5 záznamů'],
  ])('záznamů: %i', async (count, text) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <LogsPanel
          scopeKey="test-logs"
          eyebrow="Diagnostika"
          title="Logy"
          description="Záznamy aplikace"
          loadLogFiles={async () => ({ files: [] })}
          loadLogs={async () => ({ date: '2026-11-25', count, logs: Array.from({ length: count }, (_, i) => ({ level: 'info', msg: `Záznam ${i}` })) })}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByText(text)).toBeInTheDocument()
  })
})
