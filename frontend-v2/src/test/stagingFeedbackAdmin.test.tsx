import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { stagingFeedbackApi, type StagingFeedbackRecord } from '@/api/stagingFeedback'
import { StagingFeedbackSection } from '@/features/admin/components/StagingFeedbackSection'

// #390: správce na stagingu čte zpětnou vazbu testerů ve Správě

const record = (over: Partial<StagingFeedbackRecord>): StagingFeedbackRecord => ({
  id: 'f1', taskId: 'nakup', text: 'Nevím, kde přidat položku', screen: '/shopping', viewportWidth: 360,
  createdAt: '2026-11-24T10:05:00.000Z', cabinId: 'c1', userId: 'u1', username: 'demo-mamka', ...over,
})

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}><StagingFeedbackSection /></QueryClientProvider>,
  )
}

describe('sekce „Zpětná vazba z testování“ ve Správě (#390)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Neprázdné testovací účty = staging
    vi.spyOn(authApi, 'getDemoAccounts').mockResolvedValue([{ username: 'demo-mamka', label: 'Mamka', role: 'user', password: 'x' }])
  })

  it('shows every record in server order with text, author, task, screen, device and time', async () => {
    vi.spyOn(stagingFeedbackApi, 'list').mockResolvedValue([
      record({ id: 'f2', taskId: 'general', text: 'Chybí mi počasí', screen: '/dashboard', viewportWidth: 1280, username: 'demo-jana' }),
      record({}),
    ])
    renderSection()

    const region = await screen.findByRole('region', { name: 'Zpětná vazba z testování' })
    const items = await within(region).findAllByRole('listitem')
    expect(items).toHaveLength(2)
    const [newest, older] = items.map((li) => within(li))
    expect(newest.getByText('Chybí mi počasí')).toBeInTheDocument()
    expect(newest.getByText(/demo-jana/)).toBeInTheDocument()
    expect(newest.getByText(/Cokoli dalšího/)).toBeInTheDocument()
    expect(newest.getByText(/Desktop/)).toBeInTheDocument()
    expect(older.getByText('Nevím, kde přidat položku')).toBeInTheDocument()
    expect(older.getByText(/Přidej něco do nákupního seznamu/)).toBeInTheDocument()
    expect(older.getByText(/\/shopping/)).toBeInTheDocument()
    expect(older.getByText(/Mobil/)).toBeInTheDocument()
    expect(older.getByText(/24\. 11\. 2026/)).toBeInTheDocument()
  })

  it('explains the empty state', async () => {
    vi.spyOn(stagingFeedbackApi, 'list').mockResolvedValue([])
    renderSection()
    expect(await screen.findByText('Zatím nikdo nic nenapsal')).toBeInTheDocument()
  })

  it('renders nothing and does not ask for feedback outside staging', async () => {
    vi.spyOn(authApi, 'getDemoAccounts').mockResolvedValue([])
    const list = vi.spyOn(stagingFeedbackApi, 'list').mockResolvedValue([])
    const { container } = renderSection()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container).toBeEmptyDOMElement()
    expect(list).not.toHaveBeenCalled()
  })
})
