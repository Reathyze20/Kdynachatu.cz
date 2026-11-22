import { afterEach, describe, expect, it } from 'vitest'
import { clearLegacyStorage } from '@/lib/legacyStorage'

describe('úklid starých klíčů v localStorage (#248)', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty('--bg-image')
  })

  it('smaže vlastní pozadí uložené zrušeným zen módem a nepoužije ho', () => {
    localStorage.setItem('app-background', '/uploads/wallpapers/stara-tapeta.jpg')

    clearLegacyStorage()

    expect(localStorage.getItem('app-background')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--bg-image')).toBe('')
  })

  it('ostatní uložená nastavení nechá být', () => {
    localStorage.setItem('authToken', 'token')

    clearLegacyStorage()

    expect(localStorage.getItem('authToken')).toBe('token')
  })
})
