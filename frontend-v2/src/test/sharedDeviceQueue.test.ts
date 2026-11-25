import type { InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enqueueMutation, flushQueue, initOfflineQueue, isQueueableRequest } from '@/lib/offlineQueue'

// #478: offline fronta je vázaná na uživatele a chatu, hesla a účet do ní nikdy nejdou.
// Fiktivní data, žádná reálná chata.
const { api } = vi.hoisted(() => ({ api: { request: vi.fn() } }))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

const STORAGE_KEY = 'offlineMutationQueue'

function signIn(userId: string, cabinId: string) {
  localStorage.setItem('userId', userId)
  localStorage.setItem('activeCabinId', cabinId)
}

function queue(method: string, url: string, data?: unknown) {
  return enqueueMutation({ method, url, data, headers: {} } as InternalAxiosRequestConfig)
}

function storedQueue(): Array<Record<string, unknown>> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  api.request.mockReset().mockResolvedValue({ data: {} })
})

describe('Offline fronta vázaná na uživatele a chatu (#478)', () => {
  it('položka nese userId a cabinId přihlášeného uživatele', () => {
    signIn('u-jana', 'cabin-1')
    queue('post', '/shopping-lists', { name: 'Na víkend' })

    expect(storedQueue()[0]).toMatchObject({ userId: 'u-jana', cabinId: 'cabin-1', url: '/shopping-lists' })
  })

  it('položka jiného uživatele se nepřehraje a zahodí se', async () => {
    signIn('u-jana', 'cabin-1')
    queue('post', '/shopping-lists', { name: 'Na víkend' })
    signIn('u-petr', 'cabin-1')

    await flushQueue()

    expect(api.request).not.toHaveBeenCalled()
    expect(storedQueue()).toHaveLength(0)
  })

  it('položka jiné chaty se nepřehraje a zahodí se, vlastní se odešle', async () => {
    signIn('u-jana', 'cabin-1')
    queue('post', '/shopping-lists', { name: 'Chata 1' })
    signIn('u-jana', 'cabin-2')
    queue('post', '/shopping-lists', { name: 'Chata 2' })

    await flushQueue()

    expect(api.request).toHaveBeenCalledTimes(1)
    expect(api.request.mock.calls[0][0]).toMatchObject({ data: { name: 'Chata 2' } })
    expect(storedQueue()).toHaveLength(0)
  })

  it('po vypršení session (nikdo přihlášený) cizí položky počkají na svého autora', async () => {
    signIn('u-jana', 'cabin-1')
    queue('post', '/shopping-lists', { name: 'Na víkend' })
    localStorage.removeItem('userId')
    localStorage.removeItem('activeCabinId')

    await flushQueue()

    expect(api.request).not.toHaveBeenCalled()
    expect(storedQueue()).toHaveLength(1)
  })

  it('staré položky bez userId se při startu zahodí', () => {
    signIn('u-jana', 'cabin-1')
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'old', method: 'post', url: '/shopping-lists', data: { name: 'Stará' }, queuedAt: '2026-11-01T10:00:00Z' },
    ]))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    initOfflineQueue()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('Hesla a účet do fronty nikdy (#478)', () => {
  const cfg = (method: string, url: string, data?: unknown) =>
    ({ method, url, data: data === undefined ? undefined : JSON.stringify(data), headers: {} }) as InternalAxiosRequestConfig

  it.each([
    ['změna hesla', cfg('patch', '/users/me/password', { oldPassword: 'stare-heslo', newPassword: 'nove-heslo-123' })],
    ['reset hesla', cfg('post', '/reset-password', { token: 'x', password: 'nove-heslo-123' })],
    ['zapomenuté heslo', cfg('post', '/forgot-password', { email: 'jana@example.test' })],
    ['změna e-mailu', cfg('patch', '/users/me', { email: 'nova@example.test', currentPassword: 'heslo-123' })],
    ['smazání účtu', cfg('delete', '/users/me', { password: 'heslo-123' })],
    ['odhlásit všude', cfg('post', '/users/me/logout-all')],
    ['přihlášení', cfg('post', '/login', { username: 'jana', password: 'heslo-123' })],
    ['registrace', cfg('post', '/register', { username: 'jana', password: 'heslo-123' })],
    ['přijetí pozvánky s heslem', cfg('post', '/invites/accept/abc', { username: 'jana', password: 'heslo-123' })],
  ])('%s se do fronty nezařadí', (_label, config) => {
    expect(isQueueableRequest(config)).toBe(false)
  })

  it('změna barvy profilu do fronty smí', () => {
    expect(isQueueableRequest(cfg('patch', '/users/me', { color: '#5d9b62' }))).toBe(true)
  })
})
