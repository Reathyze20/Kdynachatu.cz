import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { authApi } from '@/api/auth'
import { AuthProvider } from '@/context/AuthContext'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'
import { SidebarProfileMenu } from '@/components/layout/SidebarProfileMenu'
import { enqueueMutation, getQueueLength } from '@/lib/offlineQueue'
import { showToast } from '@/lib/toast'
import type { ReactElement } from 'react'

// #537: odhlášení s neodeslanými offline změnami se nejdřív zeptá, co s nimi.
// Na sdíleném zařízení by jinak zůstaly v LocalStorage a další účet by je bez upozornění zahodil.
// Fiktivní data, žádná reálná chata.

const { api } = vi.hoisted(() => ({
  api: {
    request: vi.fn(),
    get: vi.fn(),
  },
}))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

const STORAGE_KEY = 'offlineMutationQueue'

function signIn(userId: string) {
  Object.entries({ authToken: `t-${userId}`, userId, username: 'Jana', role: 'user', cabinId: 'cabin-1' }).forEach(
    ([k, v]) => localStorage.setItem(k, v),
  )
}

function queueChanges(count: number) {
  for (let i = 0; i < count; i += 1) {
    enqueueMutation({ method: 'post', url: '/notes', data: { text: `Poznámka ${i + 1}` }, headers: {} } as InternalAxiosRequestConfig)
  }
}

function renderWithSession(page: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/kalendar']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<h1>Přihlašovací stránka</h1>} />
            <Route path="*" element={page} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function clickSidebarLogout() {
  const user = userEvent.setup()
  renderWithSession(<SidebarProfileMenu onOpenProfileDrawer={vi.fn()} />)
  await user.click(screen.getByTestId('profile-menu-button'))
  await user.click(screen.getByRole('menuitem', { name: 'Odhlásit' }))
  return user
}

describe('Odhlášení s neodeslanými offline změnami (#537)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.mocked(showToast).mockClear()
    api.request.mockReset().mockResolvedValue({ data: {} })
    api.get.mockReset().mockResolvedValue({ data: { email: 'jana@example.test', color: '#5d9b62', animalIcon: null } })
    vi.spyOn(authApi, 'syncUploadsCookie').mockResolvedValue()
    vi.spyOn(authApi, 'logout').mockResolvedValue()
    signIn('u-jana')
  })
  afterEach(() => vi.restoreAllMocks())

  it('bez neodeslaných změn odhlásí hned, bez dotazu', async () => {
    await clickSidebarLogout()

    expect(await screen.findByRole('heading', { name: 'Přihlašovací stránka' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem('authToken')).toBeNull()
  })

  it.each([
    [1, '1 změna se ještě neodeslala'],
    [2, '2 změny se ještě neodeslaly'],
    [5, '5 změn se ještě neodeslalo'],
  ])('s %i neodeslanými změnami se zeptá: „%s“', async (count, text) => {
    queueChanges(count)

    await clickSidebarLogout()

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(text)
    expect(within(dialog).getByRole('button', { name: 'Odeslat a odhlásit' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Zahodit a odhlásit' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Zrušit' })).toBeInTheDocument()
    expect(localStorage.getItem('authToken')).toBe('t-u-jana')
  })

  it('„Zrušit“ zavře dotaz, neodhlásí a změny nechá ve frontě', async () => {
    queueChanges(2)
    const user = await clickSidebarLogout()

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Zrušit' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(localStorage.getItem('authToken')).toBe('t-u-jana')
    expect(getQueueLength()).toBe(2)
    expect(authApi.logout).not.toHaveBeenCalled()
  })

  it('„Zahodit a odhlásit“ smaže jen moje změny v aktivní chatě a odhlásí', async () => {
    signIn('u-petr')
    queueChanges(1)
    signIn('u-jana')
    queueChanges(2)
    const user = await clickSidebarLogout()

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Zahodit a odhlásit' }))

    expect(await screen.findByRole('heading', { name: 'Přihlašovací stránka' })).toBeInTheDocument()
    expect(localStorage.getItem('authToken')).toBeNull()
    expect(api.request).not.toHaveBeenCalled()
    const left = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Array<{ userId: string }>
    expect(left.map((entry) => entry.userId)).toEqual(['u-petr'])
  })

  it('„Odeslat a odhlásit“ s připojením změny odešle a odhlásí', async () => {
    queueChanges(2)
    const user = await clickSidebarLogout()

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Odeslat a odhlásit' }))

    expect(await screen.findByRole('heading', { name: 'Přihlašovací stránka' })).toBeInTheDocument()
    expect(api.request).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('authToken')).toBeNull()
  })

  it('„Odeslat a odhlásit“ bez připojení neodhlásí, ukáže chybu a fronta zůstane', async () => {
    queueChanges(2)
    api.request.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'))
    const user = await clickSidebarLogout()

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Odeslat a odhlásit' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Změny se nepodařilo odeslat')
    expect(screen.queryByRole('heading', { name: 'Přihlašovací stránka' })).not.toBeInTheDocument()
    expect(localStorage.getItem('authToken')).toBe('t-u-jana')
    expect(getQueueLength()).toBe(2)
    expect(authApi.logout).not.toHaveBeenCalled()
  })

  it('„Odeslat a odhlásit“ při vypršené session netvrdí, že je odesláno, a změny nechá autorovi', async () => {
    queueChanges(2)
    // Interceptor klienta při 401 smaže uloženou identitu; fronta tím nesmí vypadat prázdná
    api.request.mockImplementation(async () => {
      localStorage.removeItem('userId')
      localStorage.removeItem('cabinId')
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, null, { status: 401 } as AxiosResponse)
    })
    const user = await clickSidebarLogout()

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Odeslat a odhlásit' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Změny se nepodařilo odeslat')
    expect(showToast).not.toHaveBeenCalledWith('Odhlášeno.', 'info')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toHaveLength(2)
  })

  it('šuplík profilu se ptá taky a nezavře se dřív, než padne volba', async () => {
    queueChanges(1)
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithSession(<ProfileDrawer isOpen onClose={onClose} />)
    await user.click(screen.getByTestId('profile-tab-security-button'))

    await user.click(screen.getByRole('button', { name: 'Odhlásit' }))

    expect(await screen.findByRole('dialog')).toHaveTextContent('1 změna se ještě neodeslala')
    expect(onClose).not.toHaveBeenCalled()

    // Escape zavře jen dotaz, šuplík zůstane
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Odhlásit' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Zahodit a odhlásit' }))

    expect(await screen.findByRole('heading', { name: 'Přihlašovací stránka' })).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })
})
