import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/api/auth'
import apiClient from '@/api/client'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { useSocket } from '@/hooks/useSocket'

// #486: server ukončí socket při zneplatnění přihlášení (ban, odebrání, heslo, „Odhlásit všude“)
// a handshake se starým tokenem odmítne. Frontend pak přejde na přihlášení, ne do reconnectu.

const fake = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const socket = {
    active: true,
    on: (event: string, handler: (...args: unknown[]) => void) => (handlers.set(event, handler), socket),
    off: () => socket,
    emit: () => socket,
    connect: vi.fn(),
    disconnect: () => socket,
    io: { on: () => undefined },
  }
  return { socket, fire: (event: string, arg: unknown) => act(() => void handlers.get(event)?.(arg)) }
})

vi.mock('socket.io-client', () => ({ io: () => fake.socket }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

const requests: { url?: string; token: string }[] = []
const NEW_LOGIN = { token: 'novy-token', username: 'jana', userId: 'u-1', role: 'user', cabinId: 'cabin-1', isSuperAdmin: false, remember: true }

function SocketScreen() {
  useSocket()
  const { token, login } = useAuth()
  return (
    <div>
      <span data-testid="path">{useLocation().pathname}</span>
      <span data-testid="token">{token ?? 'none'}</span>
      <button data-testid="new-token" onClick={() => login(NEW_LOGIN)} />
    </div>
  )
}

function renderScreen() {
  render(
    <MemoryRouter initialEntries={['/prehled']}>
      <AuthProvider>
        <SocketScreen />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('socket odpojený kvůli zneplatnění přihlášení (#486)', () => {
  const originalAdapter = apiClient.defaults.adapter

  beforeEach(() => {
    vi.useFakeTimers()
    requests.length = 0
    fake.socket.active = true
    fake.socket.connect.mockClear()
    localStorage.clear()
    Object.entries({ authToken: 'stary-token', username: 'jana', userId: 'u-1', role: 'user', cabinId: 'cabin-1' }).forEach(
      ([key, value]) => localStorage.setItem(key, value),
    )
    // Cookie pro fotky (#487) si appka vyžádá při startu, dokud je relace platná; zneplatnění přijde až potom.
    // Že se volá, ověřuje uploadsCookie.test.tsx; tady by jen přidal request mimo ověření relace.
    vi.spyOn(authApi, 'syncUploadsCookie').mockResolvedValue()
    // Server přihlášení odmítá: každý požadavek dostane 401.
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      requests.push({ url: config.url, token: String(config.headers.Authorization).replace('Bearer ', '') })
      const response = { data: { message: 'Neplatný token.' }, status: 401, statusText: 'Unauthorized', headers: {}, config }
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, response)
    }
  })

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([
    ['server spojení ukončil', () => fake.fire('disconnect', 'io server disconnect')],
    ['handshake odmítnutý serverem', () => { fake.socket.active = false; fake.fire('connect_error', new Error('Neplatný token')) }],
  ])('%s → ověří relaci a přejde na přihlášení', async (_name, trigger) => {
    renderScreen()
    trigger()
    await advance(4000)

    expect(requests).toEqual([{ url: '/users/me', token: 'stary-token' }])
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/)
    expect(localStorage.getItem('authToken')).toBeNull()
  })

  it('výpadek sítě relaci neověřuje, Socket.IO se připojí samo', async () => {
    renderScreen()
    fake.fire('disconnect', 'transport close')
    fake.fire('connect_error', new Error('xhr poll error'))
    await advance(4000)

    expect(requests).toEqual([])
    expect(screen.getByTestId('path')).toHaveTextContent('/prehled')
  })

  it('platná relace (např. po opuštění chaty) → socket se připojí znovu', async () => {
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
    renderScreen()
    fake.fire('disconnect', 'io server disconnect')
    await advance(4000)

    expect(fake.socket.connect).toHaveBeenCalledOnce()
    expect(screen.getByTestId('path')).toHaveTextContent('/prehled')
  })

  it('změna vlastního hesla: nový token dorazí během prodlevy → uživatel zůstane přihlášený', async () => {
    renderScreen()
    fake.fire('disconnect', 'io server disconnect')
    await advance(200)
    act(() => screen.getByTestId('new-token').click())
    await advance(4000)

    expect(requests).toEqual([])
    expect(screen.getByTestId('token')).toHaveTextContent('novy-token')
    expect(screen.getByTestId('path')).toHaveTextContent('/prehled')
  })
})
