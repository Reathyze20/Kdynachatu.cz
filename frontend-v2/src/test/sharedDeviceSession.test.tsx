import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import type { InternalAxiosRequestConfig } from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '@/api/client'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { installSessionCacheReset } from '@/lib/sessionReset'

// #478: na sdíleném zařízení (rodinný tablet) odhlášení, vypršení session (401) i přihlášení
// jiného účtu smažou cache dotazů i cache uploadů v service workeru. Fiktivní data.
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

const cachesDelete = vi.fn().mockResolvedValue(true)
let queryClient: QueryClient
let uninstall: () => void

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  cachesDelete.mockClear()
  vi.stubGlobal('caches', { delete: cachesDelete })
  queryClient = new QueryClient()
  queryClient.setQueryData(['reservations'], { reservations: [{ id: 'r-1', purpose: 'Víkend' }] })
  uninstall = installSessionCacheReset(queryClient)
})

afterEach(() => {
  uninstall()
  vi.unstubAllGlobals()
})

function storeSession(userId: string, cabinId: string) {
  const items = { authToken: `token-${userId}`, userId, username: userId, role: 'user', cabinId, activeCabinId: cabinId }
  Object.entries(items).forEach(([key, value]) => localStorage.setItem(key, value))
}

function AuthProbe({ loginAs }: { loginAs?: { userId: string; cabinId: string } }) {
  const { login, logout } = useAuth()
  return (
    <>
      <button type="button" onClick={logout}>Odhlásit</button>
      {loginAs && (
        <button type="button" onClick={() => login({ token: 't', username: 'x', role: 'user', remember: true, ...loginAs })}>
          Přihlásit
        </button>
      )}
    </>
  )
}

function renderAuth(loginAs?: { userId: string; cabinId: string }) {
  render(
    <MemoryRouter>
      <AuthProvider>
        <AuthProbe loginAs={loginAs} />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function expectCachesCleared() {
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  expect(cachesDelete).toHaveBeenCalledWith('uploads')
}

describe('Sdílené zařízení: úklid cache (#478)', () => {
  it('odhlášení vyprázdní cache dotazů a smaže cache uploadů', async () => {
    storeSession('u-jana', 'cabin-1')
    renderAuth()

    await userEvent.click(screen.getByRole('button', { name: 'Odhlásit' }))

    expectCachesCleared()
  })

  it('odpověď 401 (vypršená session) vyprázdní cache dotazů a smaže cache uploadů', async () => {
    storeSession('u-jana', 'cabin-1')
    const unauthorized = async (config: InternalAxiosRequestConfig) =>
      Promise.reject(Object.assign(new Error('Unauthorized'), {
        config,
        response: { status: 401, data: {}, headers: {}, config, statusText: 'Unauthorized' },
      }))

    await expect(apiClient.get('/reservations', { adapter: unauthorized })).rejects.toThrow()

    await waitFor(() => expectCachesCleared())
  })

  it('přihlášení jiného účtu vyprázdní cache dotazů a smaže cache uploadů', async () => {
    storeSession('u-jana', 'cabin-1')
    renderAuth({ userId: 'u-petr', cabinId: 'cabin-1' })

    await userEvent.click(screen.getByRole('button', { name: 'Přihlásit' }))

    expectCachesCleared()
  })

  it('obnovení tokenu stejného účtu (změna hesla) cache nechá, ať běží realtime invalidace', async () => {
    storeSession('u-jana', 'cabin-1')
    renderAuth({ userId: 'u-jana', cabinId: 'cabin-1' })

    await userEvent.click(screen.getByRole('button', { name: 'Přihlásit' }))

    expect(queryClient.getQueryData(['reservations'])).toBeDefined()
    expect(cachesDelete).not.toHaveBeenCalled()
  })
})
