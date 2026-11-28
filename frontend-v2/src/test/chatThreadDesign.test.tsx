import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import notesCssRaw from '@/styles/notes.css?raw'
import type { Note } from '@/api/notes'
import { ChatView } from '@/features/notes/ChatView'
import { MessageInput } from '@/features/notes/MessageInput'

// #518 (část 2): vlákno chatu podle DESIGN.md – název vlákna h2 pod h1 „Chat“, akce tématu v kebab menu, akce zprávy
// vidět bez najetí myší, ikonová tlačítka s přístupným jménem, bez slepé sponky „Přílohy – připravujeme“. Fiktivní data.

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { userId: 'u-me', username: 'jana', role: 'user' }, isAdmin: false, isGuest: false }),
}))

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn() })

const note = (id: string, userId: string, username: string, extra: Partial<Note> = {}): Note => ({
  id, userId, username, message: `Zpráva ${id}`, threadId: 't-1', createdAt: '2026-07-01T10:00:00.000Z', ...extra,
})

const noop = () => {}

function renderWithQuery(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

function renderChat(extra: Partial<Parameters<typeof ChatView>[0]> = {}) {
  return renderWithQuery(
    <ChatView notes={[note('n-1', 'u-petr', 'petr'), note('n-2', 'u-me', 'jana')]} activeThreadId="t-1" activeThreadName="Kamna"
      userMap={{}} onAddToShopping={noop} onCreateRepair={noop} onReply={noop} {...extra} />,
  )
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('chat thread per DESIGN.md (#518)', () => {
  it('the thread name is an h2, so the page keeps a single h1 "Chat" above it', () => {
    renderChat()
    expect(screen.getByRole('heading', { level: 2, name: 'Kamna' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('topic actions sit in a kebab menu that opens, closes on Escape and offers Smazat téma', () => {
    const onDeleteThread = vi.fn()
    renderChat({ onDeleteThread })
    const kebab = screen.getByRole('button', { name: 'Akce tématu' })
    expect(kebab.querySelector('svg.lucide-ellipsis-vertical')).not.toBeNull()
    expect(kebab).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(kebab)
    expect(kebab).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Smazat téma' })).toBeNull()
    expect(kebab).toHaveFocus()

    fireEvent.click(kebab)
    fireEvent.click(screen.getByRole('button', { name: 'Smazat téma' }))
    expect(onDeleteThread).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Smazat téma' })).toBeNull()
  })

  it('message actions are visible without hovering: no hover-only reveal in notes.css', () => {
    renderChat()
    for (const bubble of screen.getAllByTestId('notes-message-bubble')) {
      expect(within(bubble).getByRole('button', { name: 'Akce zprávy' }).querySelector('svg.lucide')).not.toBeNull()
    }
    const css = stripComments(notesCssRaw)
    expect(css).not.toMatch(/:hover[^{,]*\.message-action-trigger/)
    const base = [...css.matchAll(/(?:^|})\s*\.message-action-trigger\s*\{([^}]*)\}/g)].map((m) => m[1]).join(';')
    expect(base).not.toMatch(/opacity:\s*0\s*[;}]?/)
  })

  it('icon buttons in the thread header and filters have an accessible name', () => {
    renderChat()
    const filters = screen.getByRole('button', { name: 'Filtry zpráv' })
    expect(filters).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(filters)
    expect(filters).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Smazat filtry' })).toBeInTheDocument()
  })

  it('an empty thread says so through EmptyState with one calm sentence', () => {
    renderChat({ notes: [] })
    expect(screen.getByText('Zatím tu je ticho, napiš první zprávu.')).toBeInTheDocument()
  })
})

describe('message composer per DESIGN.md (#518)', () => {
  it('has no disabled attachment paperclip (dead end)', () => {
    renderWithQuery(<MessageInput activeThreadId="t-1" />)
    expect(screen.queryByRole('button', { name: /přílohu/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Odeslat' })).toBeInTheDocument()
  })

  // Panel „Odjezdový protokol“ odstranil #517 (odkaz na Předávku, chatHandoverLink.test.tsx), jeho tlačítko zavřít s ním.
  it('closing the reply preview is a named icon button', () => {
    renderWithQuery(<MessageInput activeThreadId="t-1" replyTo={note('n-1', 'u-petr', 'petr')} onCancelReply={noop} />)
    expect(screen.getByRole('button', { name: 'Zrušit odpověď' })).toBeInTheDocument()
  })
})
