import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/api/auth'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { isQueueableRequest } from '@/lib/offlineQueue'

// Fotky za httpOnly cookie (#487): starší relace si cookie vyžádá při startu appky,
// odhlášení ji nechá serverem smazat. Fiktivní data.

function LogoutButton() {
  const { logout } = useAuth()
  return <button type="button" onClick={logout}>Odhlásit</button>
}

function renderAuth() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function storeSession() {
  const items = { authToken: 'token-jana', userId: 'u-jana', username: 'jana', role: 'user', cabinId: 'cabin-1' }
  Object.entries(items).forEach(([key, value]) => localStorage.setItem(key, value))
}

let sync: ReturnType<typeof vi.spyOn>
let logout: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  sync = vi.spyOn(authApi, 'syncUploadsCookie').mockResolvedValue()
  logout = vi.spyOn(authApi, 'logout').mockResolvedValue()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cookie pro fotky (#487)', () => {
  it('přihlášená relace si při startu appky vyžádá cookie', () => {
    storeSession()
    renderAuth()
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('bez přihlášení se cookie nevyžaduje', () => {
    renderAuth()
    expect(sync).not.toHaveBeenCalled()
  })

  it('odhlášení nechá cookie smazat', async () => {
    storeSession()
    renderAuth()
    await userEvent.click(screen.getByRole('button', { name: 'Odhlásit' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('cookie requesty se offline nefrontují', () => {
    for (const url of ['/session-cookie', '/logout']) {
      expect(isQueueableRequest({ method: 'post', url, headers: {} } as unknown as InternalAxiosRequestConfig)).toBe(false)
    }
  })
})
