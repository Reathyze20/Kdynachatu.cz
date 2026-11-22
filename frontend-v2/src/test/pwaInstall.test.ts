import { afterEach, describe, expect, it } from 'vitest'
import { detectIosSafari, dismissInstallCard, recordVisit, shouldOfferInstallCard } from '@/lib/pwaInstall'

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

describe('karta instalace po 3. návštěvě (#277)', () => {
  afterEach(() => localStorage.clear())

  const minute = 60 * 1000
  const start = Date.UTC(2026, 10, 22, 8)

  it('na první a druhé návštěvě se karta neukáže, na třetí ano', () => {
    recordVisit(start)
    expect(shouldOfferInstallCard()).toBe(false)
    recordVisit(start + 24 * 60 * minute)
    expect(shouldOfferInstallCard()).toBe(false)
    recordVisit(start + 48 * 60 * minute)
    expect(shouldOfferInstallCard()).toBe(true)
  })

  it('opakované načtení během půl hodiny je pořád jedna návštěva', () => {
    recordVisit(start)
    recordVisit(start + 5 * minute)
    recordVisit(start + 20 * minute)
    expect(shouldOfferInstallCard()).toBe(false)
  })

  it('po „Teď ne“ se karta už nikdy neukáže', () => {
    for (let day = 0; day < 3; day++) recordVisit(start + day * 24 * 60 * minute)
    dismissInstallCard()

    expect(shouldOfferInstallCard()).toBe(false)
    recordVisit(start + 400 * 24 * 60 * minute)
    expect(shouldOfferInstallCard()).toBe(false)
  })

  it('poškozený počet návštěv se počítá od nuly', () => {
    localStorage.setItem('pwa-install-visits', 'nesmysl')
    recordVisit(start)
    expect(shouldOfferInstallCard()).toBe(false)
  })
})
