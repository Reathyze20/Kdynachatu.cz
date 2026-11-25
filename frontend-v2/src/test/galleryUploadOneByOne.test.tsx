import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'
import { UploadModal } from '@/features/gallery/UploadModal'
import apiClient from '@/api/client'
import { showToast } from '@/lib/toast'

// #515: fotky se nahrávají po jedné se skutečným průběhem a selhání jedné nezruší ostatní.
// Fiktivní API a soubory, žádná reálná data chaty.
vi.mock('@/api/client', () => ({ default: { post: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/lib/errorReporting', () => ({ reportError: vi.fn() }))

type UploadConfig = { onUploadProgress?: (event: { loaded: number; total?: number }) => void }
interface PendingUpload {
  form: FormData
  config: UploadConfig
  resolve: () => void
  reject: (error: unknown) => void
}

const post = vi.mocked(apiClient.post)
let pending: PendingUpload[] = []

/** Server odpověděl chybou (ne výpadek spojení). */
function serverError(data: { message?: string } = {}) {
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 500, data } as never)
}

function photo(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' })
}

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const view = render(
    <QueryClientProvider client={queryClient}>
      <UploadModal folderId="f-leto" onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, invalidate, unmount: view.unmount }
}

function pickAndSubmit(files: File[]) {
  fireEvent.change(screen.getByTestId('gallery-upload-file-input'), { target: { files } })
  fireEvent.click(screen.getByTestId('gallery-upload-submit-button'))
}

/** Názvy souborů v požadavku: každý požadavek nese právě jednu fotku. */
function sentPhotos(upload: PendingUpload) {
  return upload.form.getAll('photos').map((file) => (file as File).name)
}

beforeEach(() => {
  pending = []
  post.mockImplementation((_url: string, form?: unknown, config?: unknown) =>
    new Promise((resolve, reject) => {
      pending.push({
        form: form as FormData,
        config: (config ?? {}) as UploadConfig,
        resolve: () => resolve({ data: [{ id: `p-${pending.length}`, src: '/uploads/x.webp', folderId: 'f-leto', createdAt: '2026-07-01T10:00:00.000Z' }] }),
        reject,
      })
    }) as never,
  )
  URL.createObjectURL = vi.fn(() => 'blob:fiktivni')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('UploadModal – nahrávání po jedné fotce (#515)', () => {
  it('posílá fotky jednotlivě a ukazuje „N z M“ a procenta aktuální fotky', async () => {
    const { onClose, invalidate } = renderModal()
    pickAndSubmit([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')])

    await waitFor(() => expect(pending).toHaveLength(1))
    expect(post).toHaveBeenCalledWith('/gallery/photos', expect.any(FormData), expect.anything())
    expect(sentPhotos(pending[0])).toEqual(['a.jpg'])
    expect(pending[0].form.get('folderId')).toBe('f-leto')
    expect(screen.getByTestId('gallery-upload-progress')).toHaveTextContent('Nahrávám 1 z 3')

    act(() => pending[0].config.onUploadProgress?.({ loaded: 50, total: 100 }))
    const bar = screen.getByRole('progressbar', { name: 'Průběh nahrávání aktuální fotky' })
    expect(bar).toHaveAttribute('value', '50')
    expect(screen.getByTestId('gallery-upload-progress')).toHaveTextContent('50 %')

    await act(async () => pending[0].resolve())
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(sentPhotos(pending[1])).toEqual(['b.jpg'])
    expect(screen.getByTestId('gallery-upload-progress')).toHaveTextContent('Nahrávám 2 z 3')

    await act(async () => pending[1].resolve())
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(sentPhotos(pending[2])).toEqual(['c.jpg'])
    await act(async () => pending[2].resolve())

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledTimes(3)
    expect(showToast).toHaveBeenCalledWith('Nahrány 3 fotky.', 'success')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gallery-photos', 'f-leto'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gallery-folders'] })
  })

  it('selhání jedné fotky neruší ostatní, souhrn řekne kolik se nenahrálo a „Zkusit znovu“ pošle jen ty', async () => {
    const { onClose, invalidate } = renderModal()
    pickAndSubmit([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')])

    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve())
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => pending[1].reject(new AxiosError('Network Error', 'ERR_NETWORK')))
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(sentPhotos(pending[2])).toEqual(['c.jpg'])
    await act(async () => pending[2].resolve())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('1 fotku se nepodařilo nahrát. Spojení vypadlo, zkus to znovu po obnovení připojení.')
    expect(onClose).not.toHaveBeenCalled()
    // Nahrané fotky jsou hned vidět v albu, v modálu zůstane jen ta nenahraná.
    expect(showToast).toHaveBeenCalledWith('Nahrány 2 fotky.', 'success')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gallery-photos', 'f-leto'] })
    const previews = within(screen.getByTestId('gallery-upload-previews')).getAllByTestId('gallery-upload-preview-item')
    expect(previews).toHaveLength(1)
    expect(within(previews[0]).getByRole('img')).toHaveAttribute('alt', 'b.jpg')

    const retry = screen.getByTestId('gallery-upload-submit-button')
    expect(retry).toHaveTextContent('Zkusit znovu')
    fireEvent.click(retry)

    await waitFor(() => expect(pending).toHaveLength(4))
    expect(sentPhotos(pending[3])).toEqual(['b.jpg'])
    expect(screen.getByTestId('gallery-upload-progress')).toHaveTextContent('Nahrávám 1 z 1')
    await act(async () => pending[3].resolve())

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(showToast).toHaveBeenLastCalledWith('Nahrána 1 fotka.', 'success')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('když se nenahraje nic, modál zůstane otevřený se všemi fotkami a bez potvrzujícího toastu', async () => {
    const { onClose } = renderModal()
    pickAndSubmit([photo('a.jpg'), photo('b.jpg')])

    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].reject(serverError()))
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => pending[1].reject(serverError()))

    expect(await screen.findByRole('alert')).toHaveTextContent('2 fotky se nepodařilo nahrát. Zkus to znovu.')
    expect(screen.getAllByTestId('gallery-upload-preview-item')).toHaveLength(2)
    expect(showToast).not.toHaveBeenCalledWith(expect.stringMatching(/^Nahrán/), 'success')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('po zavření modálu uprostřed dávky se další fotky neposílají a toast řekne, že nahrávání skončilo', async () => {
    const { onClose, unmount, invalidate } = renderModal()
    pickAndSubmit([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')])

    await waitFor(() => expect(pending).toHaveLength(1))
    unmount()
    await act(async () => pending[0].resolve())

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Nahrávání zastaveno, zbývající fotky se nenahrály.', 'info'))
    expect(post).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Nahrána 1 fotka.', 'success')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gallery-photos', 'f-leto'] })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('souhrn převezme důvod, který poslal server (např. příliš velká fotka)', async () => {
    renderModal()
    pickAndSubmit([photo('velka.jpg')])

    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].reject(serverError({ message: 'Soubor je příliš velký.' })))

    expect(await screen.findByRole('alert')).toHaveTextContent('1 fotku se nepodařilo nahrát. Soubor je příliš velký.')
  })
})
