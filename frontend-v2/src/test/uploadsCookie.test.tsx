import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/api/auth'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { isQueueableRequest } from '@/lib/offlineQueue'

// Fotky za httpOnly cookie (#487): starší relace si cookie vyžádá při startu appky,
// odhlášení ji nechá serverem smazat. Fiktivní data.

function LogoutButton() {
  const { logout } = useAuth()
  return <button type="button" onClick={logout}>Odhlásit</button>
}

function renderAuth({ loggedIn }: { loggedIn: boolean }) {
  localStorage.clear()
  sessionStorage.clear()
  if (loggedIn) Object.entries({ authToken: 't-jana', userId: 'u-jana', username: 'jana', role: 'user' }).forEach(([k, v]) => localStorage.setItem(k, v))
  const sync = vi.spyOn(authApi, 'syncUploadsCookie').mockResolvedValue()
  const logout = vi.spyOn(authApi, 'logout').mockResolvedValue()
  render(<MemoryRouter><AuthProvider><LogoutButton /></AuthProvider></MemoryRouter>)
  return { sync, logout }
}

afterEach(() => vi.restoreAllMocks())

describe('cookie pro fotky (#487)', () => {
  it('přihlášená relace si při startu appky vyžádá cookie, nepřihlášená ne', () => {
    expect(renderAuth({ loggedIn: true }).sync).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
    expect(renderAuth({ loggedIn: false }).sync).not.toHaveBeenCalled()
  })

  it('odhlášení nechá cookie smazat', async () => {
    const { logout } = renderAuth({ loggedIn: true })
    await userEvent.click(screen.getByRole('button', { name: 'Odhlásit' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('cookie requesty se offline nefrontují', () => {
    for (const url of ['/session-cookie', '/logout']) {
      expect(isQueueableRequest({ method: 'post', url, headers: {} } as unknown as InternalAxiosRequestConfig)).toBe(false)
    }
  })
})
