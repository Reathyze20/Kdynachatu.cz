import { afterEach, describe, expect, it } from 'vitest'
import { detectIosSafari, dismissInstallBanner, isInstallBannerDismissed } from '@/lib/pwaInstall'

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_MODE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'

describe('detectIosSafari', () => {
  it('pozná Safari na iPhonu', () => {
    expect(detectIosSafari(IPHONE_SAFARI)).toBe(true)
  })

  it('vynechá Chrome na iOS (návod platí pro Safari)', () => {
    expect(detectIosSafari(IPHONE_CHROME)).toBe(false)
  })

  it('pozná iPad, který se hlásí jako Mac, podle dotykové obrazovky', () => {
    expect(detectIosSafari(IPAD_DESKTOP_MODE, 5)).toBe(true)
    expect(detectIosSafari(IPAD_DESKTOP_MODE, 0)).toBe(false)
  })

  it('Android není iOS', () => {
    expect(detectIosSafari(ANDROID_CHROME)).toBe(false)
  })
})

describe('odložení instalačního banneru', () => {
  afterEach(() => localStorage.clear())

  it('bez záznamu se banner zobrazuje', () => {
    expect(isInstallBannerDismissed()).toBe(false)
  })

  it('po zavření je skrytý 30 dní, pak se vrátí', () => {
    const day = 24 * 60 * 60 * 1000
    const dismissedAt = Date.UTC(2026, 10, 1)
    dismissInstallBanner(dismissedAt)

    expect(isInstallBannerDismissed(dismissedAt + 29 * day)).toBe(true)
    expect(isInstallBannerDismissed(dismissedAt + 31 * day)).toBe(false)
  })

  it('poškozená hodnota banner neblokuje', () => {
    localStorage.setItem('pwa-install-dismissed-at', 'nesmysl')
    expect(isInstallBannerDismissed()).toBe(false)
  })
})
