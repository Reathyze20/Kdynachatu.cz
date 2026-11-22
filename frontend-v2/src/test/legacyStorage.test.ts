import { afterEach, describe, expect, it } from 'vitest'
import { clearLegacyStorage } from '@/lib/legacyStorage'

describe('úklid starých klíčů v localStorage (#248)', () => {
  afterEach(() => localStorage.clear())

  it('smaže vlastní pozadí uložené zrušeným zen módem', () => {
    localStorage.setItem('app-background', '/uploads/wallpapers/stara-tapeta.jpg')

    clearLegacyStorage()

    expect(localStorage.getItem('app-background')).toBeNull()
  })

  it('ostatní uložená nastavení nechá být', () => {
    localStorage.setItem('authToken', 'token')

    clearLegacyStorage()

    expect(localStorage.getItem('authToken')).toBe('token')
  })
})
