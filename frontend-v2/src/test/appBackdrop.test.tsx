import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { AppBackdrop } from '@/components/layout/AppBackdrop'
import { CABIN_SETTINGS_KEY } from '@/features/settings/hooks/useCabinSettings'
import variablesCss from '@/styles/variables.css?raw'
import layoutCss from '@/styles/layout.css?raw'

const COVER = '/uploads/covers/0f8fad5b-d9cb-469f-a165-70867728950e.webp'
const COVER_SM = '/uploads/covers/0f8fad5b-d9cb-469f-a165-70867728950e-sm.webp'
const NEW_COVER = '/uploads/covers/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp'

function mockCabin(...urls: (string | null)[]) {
  const get = vi.spyOn(apiClient, 'get')
  for (const coverPhotoUrl of urls) get.mockResolvedValueOnce({ data: { id: 'c-1', name: 'Chata U Lesa', coverPhotoUrl } })
  return get
}

function renderBackdrop(path = '/dashboard') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AppBackdrop />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return qc
}

/** jsdom obrázky nenačítá: velikost a událost load doplní test. */
function loadImage(img: HTMLImageElement, width: number, height: number) {
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: width })
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: height })
  fireEvent.load(img)
}

async function findPhoto() {
  const backdrop = await screen.findByTestId('app-backdrop')
  return { backdrop, img: backdrop.querySelector('img')! }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Titulní fotka jako pozadí appky (#341)', () => {
  it('s URL je pozadím fotka, na mobilu varianta -sm, a ukáže se až po načtení', async () => {
    mockCabin(COVER)
    renderBackdrop()
    const { backdrop, img } = await findPhoto()

    expect(img).toHaveAttribute('src', COVER)
    expect(img).toHaveAttribute('alt', '')
    expect(backdrop.querySelector('source')).toHaveAttribute('srcset', COVER_SM)
    expect(backdrop.querySelector('source')).toHaveAttribute('media', '(max-width: 768px)')
    expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    expect(backdrop).toHaveAttribute('data-visible', 'false')

    loadImage(img, 1920, 1200)
    expect(backdrop).toHaveAttribute('data-visible', 'true')
  })

  it('mobilní varianta 1080 × 1920 má velikost pozadí', async () => {
    mockCabin(COVER)
    renderBackdrop('/reservations')
    const { backdrop, img } = await findPhoto()

    loadImage(img, 1080, 1920)
    expect(backdrop).toHaveAttribute('data-visible', 'true')
  })

  it('bez URL fotka chybí a zůstane podklad D', async () => {
    const get = mockCabin(null)
    renderBackdrop()

    await waitFor(() => expect(get).toHaveBeenCalledWith('/cabin'))
    expect(screen.queryByTestId('app-backdrop')).toBeNull()
  })

  it.each([
    ['stará varianta-pruh z 1.8.0', 1000, 360],
    ['stará mobilní varianta-pruh', 750, 280],
  ])('%s se nepoužije (podklad D)', async (_name, width, height) => {
    mockCabin(COVER)
    renderBackdrop()
    const { backdrop, img } = await findPhoto()

    loadImage(img, width, height)
    expect(backdrop).toHaveAttribute('data-visible', 'false')
  })

  it('při chybě načtení zůstane podklad D', async () => {
    mockCabin(COVER)
    renderBackdrop()
    const { backdrop, img } = await findPhoto()

    fireEvent.error(img)
    expect(backdrop).toHaveAttribute('data-visible', 'false')
  })

  it.each(['/notes', '/shopping', '/gallery', '/diary', '/reconstruction', '/admin'])(
    'na %s s textem mimo karty fotku zatím neukazuje',
    async (path) => {
      mockCabin(COVER)
      renderBackdrop(path)
      const { backdrop, img } = await findPhoto()

      loadImage(img, 1920, 1200)
      expect(backdrop).toHaveAttribute('data-visible', 'false')
    },
  )

  it('změna titulní fotky správcem se projeví bez obnovení stránky', async () => {
    mockCabin(COVER, NEW_COVER)
    const qc = renderBackdrop()
    const first = await findPhoto()
    loadImage(first.img, 1920, 1200)

    // realtime `cabin:changed` invaliduje ['cabin'] (useRealtimeSync)
    await act(() => qc.invalidateQueries({ queryKey: CABIN_SETTINGS_KEY }))

    const img = await waitFor(() => {
      const next = screen.getByTestId('app-backdrop').querySelector('img')!
      expect(next).toHaveAttribute('src', NEW_COVER)
      return next
    })
    expect(screen.getByTestId('app-backdrop')).toHaveAttribute('data-visible', 'false')
    loadImage(img, 1920, 1200)
    expect(screen.getByTestId('app-backdrop')).toHaveAttribute('data-visible', 'true')
  })

  it('fotka leží pevně za obsahem pod teplým závojem z pickeru 08', () => {
    expect(variablesCss).toContain('--backdrop-veil: linear-gradient(180deg, rgb(30 22 14 / .10), rgb(30 22 14 / .35));')
    expect(layoutCss).toMatch(/\.app-backdrop \{[^}]*position: fixed;[^}]*z-index: -1;/)
    expect(layoutCss).toMatch(/\.app-backdrop img \{[^}]*object-fit: cover;/)
    expect(layoutCss).toMatch(/\.app-backdrop__veil \{[^}]*background: var\(--backdrop-veil\);/)
  })
})
