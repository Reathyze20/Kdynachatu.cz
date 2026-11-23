import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PropsWithChildren, ReactNode } from 'react'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '@/api/client'
import type { CabinConfig } from '@/api/settings'
import type { GalleryPhoto } from '@/api/gallery'
import { Lightbox } from '@/features/gallery/Lightbox'
import { CabinSettingsPanel } from '@/features/settings/CabinSettingsPage'
import { CABIN_SETTINGS_KEY } from '@/features/settings/hooks/useCabinSettings'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { showToast } from '@/lib/toast'

const { auth, socketHandlers } = vi.hoisted(() => ({
  auth: { role: 'admin' },
  socketHandlers: new Map<string, (data?: unknown) => void>(),
}))

vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { userId: 'u-1', username: 'jana', role: auth.role }, isAdmin: auth.role === 'admin' }),
}))
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({
    on: (event: string, handler: (data?: unknown) => void) => socketHandlers.set(event, handler),
    off: vi.fn(),
    socketGeneration: 0,
  }),
}))

const COVER = '/uploads/covers/0f8fad5b-d9cb-469f-a165-70867728950e.webp'
const CABIN: CabinConfig = {
  id: 'c-1', name: 'Chata U Lesa', subdomain: 'u-lesa', description: null, welcomeMessage: null, rules: null,
  departureChecklist: ['Zavřít vodu'], coverPhotoUrl: COVER, isWinterized: false, features: {},
  weatherLocation: null, municipalityCode: null, municipalityName: null, municipalityDistrict: null,
  municipalityRegion: null, latitude: null, longitude: null,
}
const PHOTO: GalleryPhoto = { id: 'p-1', src: '/uploads/p-1.webp', folderId: 'f-1', createdAt: '2026-11-01T10:00:00.000Z', uploadedBy: 'petr' }

function renderWithClient(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
  return qc
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(showToast).mockClear()
  auth.role = 'admin'
})

describe('Galerie: Nastavit jako titulní (#321)', () => {
  it('správce v prohlížeči fotku nastaví a dostane potvrzení', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: CABIN })
    const qc = renderWithClient(<Lightbox photos={[PHOTO]} initialIndex={0} folderId="f-1" onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nastavit jako titulní' }))

    expect(put).toHaveBeenCalledWith('/cabin/cover-photo', { photoId: 'p-1' })
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Fotka je teď titulní fotkou chaty.', 'success'))
    expect(qc.getQueryData(CABIN_SETTINGS_KEY)).toEqual(CABIN)
  })

  it.each(['user', 'guest'])('%s akci nevidí', (role) => {
    auth.role = role
    renderWithClient(<Lightbox photos={[PHOTO]} initialIndex={0} folderId="f-1" onClose={vi.fn()} />)

    expect(screen.getByTestId('gallery-lightbox-toolbar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nastavit jako titulní' })).toBeNull()
  })
})

describe('Nastavení chaty: titulní fotka (#321)', () => {
  it('ukáže náhled a Odebrat fotku odebere bez ztráty rozepsaných úprav', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: CABIN })
    const del = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { ...CABIN, coverPhotoUrl: null } })
    renderWithClient(<CabinSettingsPanel />)

    const preview = await screen.findByTestId('cabin-settings-cover-photo-preview')
    expect(preview).toHaveAttribute('src', COVER)
    const name = screen.getByTestId('cabin-settings-name-input')
    await userEvent.type(name, ' a Potoka')

    await userEvent.click(screen.getByRole('button', { name: 'Odebrat titulní fotku' }))

    expect(del).toHaveBeenCalledWith('/cabin/cover-photo')
    expect(await screen.findByText('V Galerii u fotky zvol Nastavit jako titulní.')).toBeInTheDocument()
    expect(screen.queryByTestId('cabin-settings-cover-photo-preview')).toBeNull()
    expect(showToast).toHaveBeenCalledWith('Titulní fotka odebrána', 'success')
    expect(name).toHaveValue('Chata U Lesa a Potoka')
  })

  it('náhled je zmenšená desktopová varianta pozadí 16 : 10 s ořezem na střed (#340)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: CABIN })
    renderWithClient(<CabinSettingsPanel />)

    const preview = await screen.findByTestId('cabin-settings-cover-photo-preview')
    expect(preview).toHaveAttribute('width', '1920')
    expect(preview).toHaveAttribute('height', '1200')
    expect(preview).toHaveClass('aspect-[16/10]', 'object-cover', 'object-center', 'max-w-md')
  })

  it('bez titulní fotky napoví, kde ji nastavit', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { ...CABIN, coverPhotoUrl: null } })
    renderWithClient(<CabinSettingsPanel />)

    expect(await screen.findByText('V Galerii u fotky zvol Nastavit jako titulní.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Odebrat titulní fotku' })).toBeNull()
  })
})

describe('realtime: cabin:changed (#321)', () => {
  it('zneplatní nastavení chaty', async () => {
    const qc = new QueryClient()
    qc.setQueryData(CABIN_SETTINGS_KEY, CABIN)
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    renderHook(() => useRealtimeSync(), { wrapper })

    act(() => socketHandlers.get('cabin:changed')?.({}))

    await waitFor(() => expect(qc.getQueryState(CABIN_SETTINGS_KEY)?.isInvalidated).toBe(true))
  })
})
