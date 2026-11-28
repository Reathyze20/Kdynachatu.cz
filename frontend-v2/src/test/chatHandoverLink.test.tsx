import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import messageInputRaw from '@/features/notes/MessageInput.tsx?raw'
import { MessageInput } from '@/features/notes/MessageInput'

// #517: chat nemá vlastní natvrdo zadaný odjezdový seznam, předání chaty je jedním klepnutím na záložce Předávka.
// Host Předávku nevidí (403, #216), takže odkaz na ni nedostane. Fiktivní data.

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

let isGuest = false
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { userId: 'u-me', username: 'jana', role: isGuest ? 'guest' : 'user' }, isAdmin: false, isGuest }),
}))

let features: Record<string, boolean> | null = null
vi.mock('@/hooks/useCabinFeatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCabinFeatures')>()),
  useCabinFeatures: () => ({ data: { features, isWinterized: false } }),
}))

beforeEach(() => {
  isGuest = false
  features = null
})

function renderComposer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><MessageInput activeThreadId="t-1" /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('chat composer links to Předávka instead of its own departure checklist (#517)', () => {
  it('a member gets one link "Předat chatu" to the Předávka tab', () => {
    renderComposer()
    expect(screen.getByRole('link', { name: 'Předat chatu' })).toHaveAttribute('href', '/handover')
  })

  it('the old "Odjezdový protokol" panel and its checklist are gone', () => {
    renderComposer()
    expect(screen.queryByRole('button', { name: /odjezdový protokol/i })).toBeNull()
    expect(screen.queryByTestId('notes-handover-toggle-button')).toBeNull()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('the composer source has no hard-coded list of departure tasks', () => {
    expect(messageInputRaw).not.toMatch(/HANDOVER_ITEMS|Kamna|Dřevo|Kohoutky|Okenice|Odjezdový protokol/)
  })

  it('a guest is never sent to Předávka (403 for guests)', () => {
    isGuest = true
    renderComposer()
    expect(screen.queryByRole('link', { name: 'Předat chatu' })).toBeNull()
    expect(document.querySelector('a[href="/handover"]')).toBeNull()
  })

  it('no link when the cabin has reservations (and so Předávka) turned off', () => {
    features = { reservations: false }
    renderComposer()
    expect(screen.queryByRole('link', { name: 'Předat chatu' })).toBeNull()
  })
})
