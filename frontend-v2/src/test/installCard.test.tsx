import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallCard } from '@/components/shared/InstallCard'
import { recordVisit } from '@/lib/pwaInstall'
import type { InstallMode } from '@/lib/pwaInstall'

let canInstall: InstallMode = 'prompt'
const promptPwaInstall = vi.fn<() => Promise<'accepted' | 'dismissed' | 'unavailable'>>()

vi.mock('@/hooks/usePwaInstall', () => ({
  usePwaInstall: () => ({ isStandalone: canInstall === null, canInstall }),
}))
vi.mock('@/lib/pwaInstall', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pwaInstall')>()),
  promptPwaInstall: () => promptPwaInstall(),
}))

const day = 24 * 60 * 60 * 1000
function visit(times: number) {
  for (let i = 0; i < times; i++) recordVisit(Date.UTC(2026, 10, 1) + i * day)
}

describe('karta instalace na Přehledu (#277)', () => {
  beforeEach(() => {
    canInstall = 'prompt'
    promptPwaInstall.mockResolvedValue('accepted')
  })
  afterEach(() => localStorage.clear())

  it('na druhé návštěvě se ještě neukáže', () => {
    visit(2)
    render(<InstallCard />)
    expect(screen.queryByText('Otevíráš chatu často?')).not.toBeInTheDocument()
  })

  it('na třetí návštěvě nabídne přidání na plochu a „Přidat“ spustí instalaci', async () => {
    visit(3)
    render(<InstallCard />)
    expect(screen.getByText('Otevíráš chatu často?')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Přidat' }))
    expect(promptPwaInstall).toHaveBeenCalledOnce()
  })

  it('na iOS „Přidat“ ukáže krátký návod', async () => {
    canInstall = 'ios'
    visit(3)
    render(<InstallCard />)

    await userEvent.click(screen.getByRole('button', { name: 'Přidat' }))
    expect(screen.getByText(/Přidat na plochu/)).toBeInTheDocument()
  })

  it('po „Teď ne“ zmizí a už se nevrátí', async () => {
    visit(3)
    const { unmount } = render(<InstallCard />)

    await userEvent.click(screen.getByRole('button', { name: 'Teď ne' }))
    expect(screen.queryByText('Otevíráš chatu často?')).not.toBeInTheDocument()

    unmount()
    visit(5)
    render(<InstallCard />)
    expect(screen.queryByText('Otevíráš chatu často?')).not.toBeInTheDocument()
  })

  it('v nainstalované appce se neukáže', () => {
    canInstall = null
    visit(3)
    render(<InstallCard />)
    expect(screen.queryByText('Otevíráš chatu často?')).not.toBeInTheDocument()
  })
})
