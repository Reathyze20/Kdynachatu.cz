import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import notesCssRaw from '@/styles/notes.css?raw'
import type { Note } from '@/api/notes'
import { ChatView } from '@/features/notes/ChatView'
import { MessageContextMenu } from '@/features/notes/MessageContextMenu'
import { NotesPage } from '@/features/notes/NotesPage'

// #508: vlákno chatu na mobilu (390 px). jsdom nepočítá layout ani kaskádu, proto se
// rozvržení hlídá přes strukturu DOM a deklarace v notes.css, pozice menu přes změřené rozměry.

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { userId: 'u-me', username: 'jana', role: 'user' }, isAdmin: false, isGuest: false }),
}))

// jsdom nemá scrollIntoView (ChatView po vykreslení odroluje dolů)
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Hodnota vlastnosti v posledním pravidle s přesně tímto selektorem mimo @media (desktop i mobil). */
function base(selector: string, prop: string): string | undefined {
  const css = stripComments(notesCssRaw).replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  return lastDeclaration(css, selector, prop)
}

/** Hodnota vlastnosti v posledním pravidle s přesně tímto selektorem uvnitř `@media (max-width: 768px)`. */
function onMobile(selector: string, prop: string): string | undefined {
  const blocks = [...stripComments(notesCssRaw).matchAll(/@media\s*\(max-width:\s*768px\)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)]
  return lastDeclaration(blocks.map((b) => b[1]).join('\n'), selector, prop)
}

function lastDeclaration(css: string, selector: string, prop: string): string | undefined {
  let value: string | undefined
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').some((s) => s.trim() === selector)) continue
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':')
      if (i >= 0 && decl.slice(0, i).trim() === prop) value = decl.slice(i + 1).trim()
    }
  }
  return value
}

const note = (id: string, userId: string, username: string, extra: Partial<Note> = {}): Note => ({
  id, userId, username, message: `Zpráva ${id}`, threadId: null, createdAt: '2026-07-01T10:00:00.000Z', ...extra,
})

const noop = () => {}

function renderWithQuery(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

function renderChat(extra: Partial<Parameters<typeof ChatView>[0]> = {}) {
  return renderWithQuery(
    <ChatView
      notes={[note('n-1', 'u-petr', 'petr'), note('n-2', 'u-me', 'jana')]}
      activeThreadId="t-1"
      activeThreadName="Kamna"
      userMap={{}}
      onAddToShopping={noop}
      onCreateRepair={noop}
      onReply={noop}
      {...extra}
    />,
  )
}

describe('vlastní zprávy vpravo, cizí vlevo', () => {
  it('každá zpráva leží v řádku, který je sloupcový flex, takže align-self zprávy platí', () => {
    renderChat()
    const bubbles = screen.getAllByTestId('notes-message-bubble')
    expect(bubbles).toHaveLength(2)
    for (const bubble of bubbles) expect(bubble.parentElement).toHaveClass('chat-message-row')
    expect(base('.chat-message-row', 'display')).toBe('flex')
    expect(base('.chat-message-row', 'flex-direction')).toBe('column')
  })

  it('vlastní zpráva se zarovná k pravému okraji, cizí k levému', () => {
    expect(base('.message-mine', 'align-self')).toBe('flex-end')
    expect(base('.message-other', 'align-self')).toBe('flex-start')
  })

  it('upravovaná vlastní zpráva zůstane vpravo', async () => {
    // Upravit jde jen 15 minut po odeslání
    renderChat({ notes: [note('n-2', 'u-me', 'jana', { createdAt: new Date().toISOString() })] })
    const own = screen.getByTestId('notes-message-bubble')
    fireEvent.click(within(own).getByRole('button', { name: 'Akce zprávy' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Upravit' }))
    const editing = document.querySelector('.message-bubble-editing')!.closest('.message-wrapper')!
    expect(editing).toHaveClass('message-mine')
    expect(editing.parentElement).toHaveClass('chat-message-row')
  })
})

describe('hlavička vlákna na mobilu', () => {
  it('„Zpět“ je v hlavičce vlákna a vrací na seznam', () => {
    const onBack = vi.fn()
    const { container } = renderChat({ onBack })
    const header = container.querySelector('.chat-header') as HTMLElement
    const back = within(header).getByRole('button', { name: 'Zpět na seznam' })
    expect(back).toHaveTextContent('Zpět')
    fireEvent.click(back)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('bez onBack (desktop) hlavička tlačítko Zpět nemá', () => {
    renderChat()
    expect(screen.queryByRole('button', { name: 'Zpět na seznam' })).toBeNull()
  })

  it('„Zpět“ je kanonický Button: text na jednom řádku, cíl 48 px, legacy CSS mu nepřepisuje rozměry', () => {
    renderChat({ onBack: noop })
    const back = screen.getByRole('button', { name: 'Zpět na seznam' })
    expect(back).toHaveClass('whitespace-nowrap', 'min-h-(--touch-target-min)')
    for (const prop of ['width', 'min-height', 'white-space', 'padding']) expect(base('.mobile-chat-back', prop)).toBeUndefined()
  })

  it('na mobilu má hlavička menší odsazení a dlouhý název se zkrátí místo zalomení', () => {
    expect(onMobile('.chat-header', 'padding')).toBe('var(--space-xs) var(--space-sm)')
    expect(onMobile('.chat-header-info h3', 'white-space')).toBe('nowrap')
    expect(onMobile('.chat-header-info h3', 'text-overflow')).toBe('ellipsis')
    expect(onMobile('.chat-avatar-group', 'display')).toBe('none')
  })

  describe('NotesPage na mobilu', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(max-width: 768px)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
      api.get.mockImplementation((url: string) => Promise.resolve({
        data: url === '/channels'
          ? [{ id: null, name: 'Hlavní', createdById: null, createdAt: null }]
          : url.startsWith('/channels/') ? { messages: [], nextCursor: null, hasMore: false } : [],
      }))
    })
    afterEach(() => vi.unstubAllGlobals())

    it('po otevření tématu je jediné tlačítko Zpět, v hlavičce vlákna, a vrací na seznam', async () => {
      renderWithQuery(<NotesPage />)
      fireEvent.click(await screen.findByTestId('notes-thread-item'))
      await screen.findByRole('heading', { name: 'Hlavní' })
      const backs = screen.getAllByRole('button', { name: 'Zpět na seznam' })
      expect(backs).toHaveLength(1)
      expect(backs[0].closest('.chat-header')).not.toBeNull()
      fireEvent.click(backs[0])
      expect(await screen.findByTestId('notes-thread-item')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Hlavní' })).toBeNull()
    })
  })
})

describe('menu akcí zprávy je celé ve viewportu', () => {
  const size = { width: 240, height: 420 }

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => size.height)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => size.width)
    vi.stubGlobal('innerWidth', 390)
    vi.stubGlobal('innerHeight', 700)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function openMenu(anchor: { top: number; bottom: number; left: number; right: number }, isMine = true) {
    const rect = { ...anchor, x: anchor.left, y: anchor.top, width: anchor.right - anchor.left, height: anchor.bottom - anchor.top, toJSON: () => ({}) } as DOMRect
    render(
      <MessageContextMenu
        note={note('n-1', isMine ? 'u-me' : 'u-petr', isMine ? 'jana' : 'petr')}
        anchorRect={rect}
        isMine={isMine}
        isGuest={false}
        isAdmin={false}
        onClose={noop}
        onReact={noop}
        onReply={noop}
        onCopy={noop}
        onEdit={noop}
        onPin={noop}
        onAddToShopping={noop}
        onCreateRepair={noop}
        onDelete={noop}
      />,
    )
    const menu = document.querySelector('.message-context-menu') as HTMLElement
    return { top: parseFloat(menu.style.top), left: parseFloat(menu.style.left), menu }
  }

  it('menu, které se nevejde nad ani pod zprávu, se posune nahoru, aby nepřeteklo spodní okraj', () => {
    size.height = 600
    const { top } = openMenu({ top: 100, bottom: 200, left: 120, right: 380 })
    expect(top).toBeGreaterThanOrEqual(8)
    expect(top + size.height).toBeLessThanOrEqual(700 - 8)
  })

  it('vlastní zpráva přesahující pravý okraj: menu zůstane uvnitř šířky obrazovky', () => {
    size.height = 420
    const { left } = openMenu({ top: 100, bottom: 160, left: 150, right: 420 })
    expect(left).toBeGreaterThanOrEqual(8)
    expect(left + size.width).toBeLessThanOrEqual(390 - 8)
  })

  it('menu vyšší než obrazovka začne nahoře, má omezenou výšku a posouvá se', () => {
    size.height = 800
    const { top, menu } = openMenu({ top: 300, bottom: 360, left: 20, right: 300 }, false)
    expect(top).toBe(8)
    expect(menu.style.maxHeight).toBe('684px')
    expect(menu.style.overflowY).toBe('auto')
  })

  it('„Nový úkol“ má ikonu úkolu rekonstrukce (kladívko), ne hodiny', () => {
    size.height = 420
    openMenu({ top: 100, bottom: 160, left: 20, right: 300 })
    const item = screen.getByRole('button', { name: 'Nový úkol' })
    expect(item.querySelector('svg.lucide-hammer')).not.toBeNull()
    expect(item.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('reakce mají dotykovou plochu 48 px', () => {
  it('tlačítko reakce je aspoň 48 × 48 px a reakce mají mezi sebou rozestup 8 px', () => {
    expect(base('.reaction-badge', 'min-height')).toBe('var(--touch-target-min)')
    expect(base('.reaction-badge', 'min-width')).toBe('var(--touch-target-min)')
    expect(base('.reaction-bar', 'gap')).toBe('var(--touch-target-gap)')
  })

  it('reakce je tlačítko se zřetelným popisem a viditelnou kapslí uvnitř', () => {
    renderChat({
      notes: [note('n-1', 'u-petr', 'petr', { reactions: [{ emoji: '👍', count: 2, reacted: false }] })],
    })
    const reaction = screen.getByRole('button', { name: /👍\s*2/ })
    expect(reaction).toHaveClass('reaction-badge')
    expect(reaction.querySelector('.reaction-pill')).not.toBeNull()
  })
})
