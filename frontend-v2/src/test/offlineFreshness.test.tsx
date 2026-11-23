import { act, render, screen } from '@testing-library/react'
import type { InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '@/api/client'
import { OfflineBanner } from '@/components/shared/OfflineBanner'
import { formatDataTime, getLastDataAt, markDataReceived } from '@/lib/dataFreshness'
import { enqueueMutation } from '@/lib/offlineQueue'

// Pravidlo E4 Čerstvost dat (#276): online a čerstvá data = nic, offline nebo data
// starší než hodina = řádek nahoře s časem posledních dat.
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

const NOW = new Date(2026, 10, 22, 11, 0)
const at = (h: number, m: number, day = 22) => new Date(2026, 10, day, h, m).getTime()

let onlineState = true
function setOnline(value: boolean) {
  onlineState = value
  act(() => void window.dispatchEvent(new Event(value ? 'online' : 'offline')))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
  onlineState = true
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => onlineState })
})
afterEach(() => vi.useRealTimers())

describe('E4 Čerstvost dat: upozornění nahoře', () => {
  it('online s čerstvými daty nic, offline „Jsi offline · údaje z HH:MM“, po připojení zase nic', () => {
    markDataReceived(at(10, 55))
    render(<OfflineBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()

    setOnline(false)
    expect(screen.getByRole('alert')).toHaveTextContent('Jsi offline · údaje z 10:55.')

    setOnline(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('online s daty staršími než hodina ukáže „Údaje z HH:MM“', () => {
    markDataReceived(at(9, 40))
    render(<OfflineBanner />)

    expect(screen.getByRole('status')).toHaveTextContent('Údaje z 9:40.')
  })

  it('offline s čekající změnou řekne, že čeká na odeslání', () => {
    markDataReceived(at(10, 55))
    enqueueMutation({ method: 'patch', url: '/reservations/r-1/checkout', headers: {} } as InternalAxiosRequestConfig)
    render(<OfflineBanner />)

    setOnline(false)
    expect(screen.getByRole('alert')).toHaveTextContent('Jsi offline · údaje z 10:55. 1 změna čeká na odeslání.')
  })

  it('data z jiného dne mají u času i datum', () => {
    expect(formatDataTime(at(18, 5, 21), NOW.getTime())).toBe('21. 11. 18:05')
    expect(formatDataTime(at(8, 0), NOW.getTime())).toBe('8:00')
  })

  it('čas posledních dat bere z úspěšné odpovědi GET, ne z mutace', async () => {
    const ok = async (config: InternalAxiosRequestConfig) => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
    markDataReceived(at(9, 0))

    await apiClient.post('/test', {}, { adapter: ok })
    expect(getLastDataAt()).toBe(at(9, 0))

    await apiClient.get('/test', { adapter: ok })
    expect(getLastDataAt()).toBe(NOW.getTime())
  })
})
