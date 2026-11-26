import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GalleryPage } from '@/features/gallery/GalleryPage'

// #519: galerie podle DESIGN.md – jediné h1, album se Zpět a „Nahrát“, výběr fotek,
// prázdné album přes EmptyState a fotky ovladatelné z klávesnice.

const { api, auth } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  auth: { isGuest: false },
}))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { userId: 'u-me', username: 'jana', role: 'user' }, isAdmin: false, isGuest: auth.isGuest }),
}))

const photo = (id: string) => ({ id, src: `/uploads/${id}.jpg`, folderId: 'g-leto', createdAt: '2026-07-02T10:00:00.000Z', uploadedBy: 'jana' })
let photos: ReturnType<typeof photo>[] = []

beforeEach(() => {
  vi.clearAllMocks()
  auth.isGuest = false
  photos = [photo('p-1'), photo('p-2')]
  const folder = { id: 'g-leto', name: 'Léto', photoCount: 2, createdAt: '2026-07-01T10:00:00.000Z', createdBy: 'jana' }
  api.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/gallery/folders' ? [folder] : photos }))
})

async function openAlbum() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><GalleryPage /></QueryClientProvider>)
  fireEvent.click(await screen.findByTestId('gallery-folder-card'))
  // Přehled alb nejdřív doanimuje odchod (AnimatePresence mode="wait"), pak se fotky načtou.
  await waitFor(() => expect(screen.queryByTestId('gallery-folder-card')).toBeNull())
  await waitFor(() => expect(screen.queryByText('Načítám fotky…')).toBeNull())
}

const h1s = () => screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)

describe('Galerie podle DESIGN.md (#519)', () => {
  it('album má jediné h1, počet fotek, „Nahrát“ jako primární akci a Zpět na přehled s h1 „Galerie“', async () => {
    await openAlbum()
    expect(h1s()).toEqual(['Léto'])
    expect(screen.getByText('2 fotky')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nahrát' })).toHaveClass('bg-primary')

    fireEvent.click(screen.getByRole('button', { name: 'Zpět' }))
    await screen.findByTestId('gallery-folder-card')
    expect(h1s()).toEqual(['Galerie'])
  })

  it('ve výběru je „Zrušit výběr“ sekundární, „Nahrát“ zůstává primární a akce mají viditelný text', async () => {
    await openAlbum()
    fireEvent.click(screen.getByRole('button', { name: 'Vybrat' }))

    const cancel = screen.getByRole('button', { name: 'Zrušit výběr' })
    expect(cancel).not.toHaveClass('bg-primary')
    expect(screen.getByRole('button', { name: 'Nahrát' })).toHaveClass('bg-primary')
    expect(screen.getByRole('button', { name: 'Vybrat vše' })).toHaveTextContent('Vybrat vše')
    expect(screen.getByRole('button', { name: 'Smazat vybrané' })).toBeDisabled()

    fireEvent.click(cancel)
    expect(screen.getByRole('button', { name: 'Vybrat' })).toBeInTheDocument()
  })

  it('fotku jde z klávesnice otevřít v prohlížeči i vybrat', async () => {
    await openAlbum()
    const first = () => screen.getAllByTestId('gallery-photo-card')[0]
    expect(first()).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(first(), { key: 'Enter' })
    expect(await screen.findByTestId('gallery-lightbox')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: 'Vybrat' }))
    fireEvent.keyDown(first(), { key: ' ' })
    expect(first()).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('1 vybráno')).toBeInTheDocument()
  })

  it('prázdné album ukáže EmptyState s akcí „Nahrát fotky“', async () => {
    photos = []
    await openAlbum()
    expect(screen.getByText('Zatím tu nejsou žádné fotky.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nahrát fotky' })).toBeInTheDocument()
  })

  it('host v albu nevidí Nahrát ani Vybrat', async () => {
    auth.isGuest = true
    await openAlbum()
    expect(screen.queryByRole('button', { name: 'Nahrát' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Vybrat' })).toBeNull()
  })
})
