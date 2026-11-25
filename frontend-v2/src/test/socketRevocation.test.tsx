import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '@/api/client'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { useSocket } from '@/hooks/useSocket'

// #486: server ukončí socket při zneplatnění přihlášení (ban, odebrání, heslo, „Odhlásit všude“)
// a handshake se starým tokenem odmítne. Frontend pak přejde na přihlášení, ne do reconnectu.

const fake = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const socket = {
    active: true,
    on: (event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler)
      return socket
    },
    off: () => socket,
    emit: () => socket,
    connect: () => socket,
    disconnect: () => socket,
    io: { on: () => undefined },
  }
  return { socket, fire: (event: string, ...args: unknown[]) => handlers.get(event)?.(...args) }
})

vi.mock('socket.io-client', () => ({ io: () => fake.socket }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

const requests: { url?: string; token?: string }[] = []

function SocketScreen() {
  useSocket()
  const { token, login } = useAuth()
  const location = useLocation()
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="token">{token ?? 'none'}</span>
      <button
        data-testid="new-token"
        onClick={() =>
          login({ token: 'novy-token', username: 'jana', userId: 'u-1', role: 'user', cabinId: 'cabin-1', isSuperAdmin: false, remember: true })
        }
      />
    </div>
  )
}

function renderScreen() {
  return render(
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
    localStorage.clear()
    sessionStorage.clear()
    Object.entries({ authToken: 'stary-token', username: 'jana', userId: 'u-1', role: 'user', cabinId: 'cabin-1' }).forEach(
      ([key, value]) => localStorage.setItem(key, value),
    )
    // Server přihlášení odmítá: každý požadavek se starým tokenem dostane 401.
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const token = String(config.headers.Authorization ?? '').replace('Bearer ', '')
      requests.push({ url: config.url, token })
      const response = { data: { message: 'Neplatný token.' }, status: 401, statusText: 'Unauthorized', headers: {}, config }
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, response)
    }
  })

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter
    vi.useRealTimers()
  })

  it('server spojení ukončil → ověří relaci a přejde na přihlášení', async () => {
    renderScreen()

    act(() => fake.fire('disconnect', 'io server disconnect'))
    await advance(2000)

    expect(requests).toEqual([{ url: '/users/me', token: 'stary-token' }])
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/)
    expect(screen.getByTestId('token')).toHaveTextContent('none')
    expect(localStorage.getItem('authToken')).toBeNull()
  })

  it('handshake odmítnutý serverem → přejde na přihlášení', async () => {
    renderScreen()

    fake.socket.active = false
    act(() => fake.fire('connect_error', new Error('Neplatný token')))
    await advance(2000)

    expect(requests).toHaveLength(1)
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/)
  })

  it('výpadek sítě relaci neověřuje, Socket.IO se připojí samo', async () => {
    renderScreen()

    act(() => fake.fire('disconnect', 'transport close'))
    act(() => fake.fire('connect_error', new Error('xhr poll error')))
    await advance(2000)

    expect(requests).toEqual([])
    expect(screen.getByTestId('path')).toHaveTextContent('/prehled')
  })

  it('změna vlastního hesla: nový token dorazí během prodlevy → uživatel zůstane přihlášený', async () => {
    renderScreen()

    act(() => fake.fire('disconnect', 'io server disconnect'))
    await advance(200)
    act(() => screen.getByTestId('new-token').click())
    await advance(2000)

    expect(requests).toEqual([])
    expect(screen.getByTestId('token')).toHaveTextContent('novy-token')
    expect(screen.getByTestId('path')).toHaveTextContent('/prehled')
  })
})
