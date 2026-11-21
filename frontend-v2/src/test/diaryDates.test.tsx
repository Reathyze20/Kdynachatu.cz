import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DiaryPage } from '@/features/diary/DiaryPage'
import type { DiaryEntry, DiaryFolder } from '@/api/diary'

// CHARAKTERIZACE, NE CÍLOVÝ STAV (#185).
// Deník staví dny přes `new Date('YYYY-MM-DD')` + setHours(0) + toISOString(). V Europe/Prague
// je proto klíč každého dne (data-date, `date` při uložení) o den dřív než zobrazený den,
// a to celý den, ne jen kolem půlnoci. Zápisky uložené z frontend-v2 tak v DB leží pod
// „zobrazený den − 1“, zatímco starý frontend (před dubnem 2026) ukládal správné datum.
// Samotná oprava klíčů by v UI posunula existující zápisky o den (zápisek z prvního dne by
// zmizel), takže čeká na rozhodnutí o opravě dat. Tento test hlídá, aby se mapování
// klíč ↔ den nezměnilo potichu, bez té opravy.

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-me' } }) }))

// Pobyt přes noc přechodu na letní čas (So 27. 3. → Po 29. 3. 2027).
const folder: DiaryFolder = {
  id: 'f-1', name: 'Velikonoce', startDate: '2027-03-27', endDate: '2027-03-29', createdAt: '2027-03-01T10:00:00.000Z',
}

function entry(date: string, content: string): DiaryEntry {
  return { id: `e-${date}`, folderId: 'f-1', date, content, galleryPhotoIds: [], createdAt: '2027-03-30T10:00:00.000Z' }
}

async function openFolder(entries: DiaryEntry[]) {
  api.get.mockImplementation((url: string) => {
    if (url === '/diary/folders') return Promise.resolve({ data: [folder] })
    if (url.startsWith('/diary/entries')) return Promise.resolve({ data: entries })
    if (url === '/reservations') return Promise.resolve({ data: { reservations: [] } })
    return Promise.resolve({ data: [] })
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><DiaryPage /></QueryClientProvider>)
  fireEvent.click(await screen.findByTestId('diary-folder-card'))
  return screen.findAllByTestId('diary-day-card')
}

const shownDay = (card: HTMLElement) => card.querySelector('.day-number')?.textContent

beforeAll(() => {
  vi.stubEnv('TZ', 'Europe/Prague')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('diary dates in Europe/Prague (characterization, #185)', () => {
  it('runs in Europe/Prague (sanity check of the test setup)', () => {
    expect(new Date('2027-07-09T22:30:00Z').getDate()).toBe(10)
  })

  it('every day card is keyed one day before the day it shows', async () => {
    const cards = await openFolder([])
    expect(cards.map(shownDay)).toEqual(['27', '28', '29'])
    expect(cards.map(c => c.getAttribute('data-date'))).toEqual(['2027-03-26', '2027-03-27', '2027-03-28'])
  })

  it('an entry is shown on the card the day after its date; the last day reads nothing', async () => {
    const cards = await openFolder([entry('2027-03-26', 'Příjezd'), entry('2027-03-29', 'Odjezd')])
    expect(cards[0].textContent).toContain('Příjezd')
    expect(cards.some(c => c.textContent?.includes('Odjezd'))).toBe(false)
  })

  it('saving from a card writes the same key the card reads from, so existing entries stay put', async () => {
    api.post.mockResolvedValue({ data: entry('2027-03-26', 'Dorazili jsme') })
    const cards = await openFolder([])
    fireEvent.click(cards[0])
    expect(await screen.findByText('Sobota, 27. března 2027')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Dorazili jsme' } })
    fireEvent.click(screen.getByRole('button', { name: /Uložit/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith('/diary/entries', expect.objectContaining({ date: '2027-03-26' }))
  })
})
