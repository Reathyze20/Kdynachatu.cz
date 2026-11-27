import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { LogResponse } from '@/api/admin'
import { LogsPanel } from '@/components/shared/LogsPanel'

/** Panel logů na kanonických komponentách (#526, DESIGN.md §6 a §7): karta, pole, tlačítka a prázdný stav. Fiktivní data. */

function renderPanel(loadLogs: () => Promise<LogResponse>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <LogsPanel
        scopeKey="test-logs"
        eyebrow="Diagnostika"
        title="Systémové logy"
        description="Záznamy aplikace"
        loadLogFiles={async () => ({ files: ['2026-11-25'] })}
        loadLogs={loadLogs}
      />
    </QueryClientProvider>,
  )
}

describe('panel logů (#526)', () => {
  it('je sekce pojmenovaná nadpisem karty', async () => {
    renderPanel(async () => ({ date: '2026-11-25', count: 0, logs: [] }))
    expect(await screen.findByRole('region', { name: 'Systémové logy' })).toHaveAttribute('data-testid', 'logs-panel')
  })

  it('bez záznamů ukáže prázdný stav jednou větou', async () => {
    renderPanel(async () => ({ date: '2026-11-25', count: 0, logs: [] }))
    expect(await screen.findByText('Pro tento filtr tu nejsou žádné logy.')).toBeInTheDocument()
  })

  it('načítání ohlásí čtečce', () => {
    renderPanel(() => new Promise(() => {}))
    expect(screen.getByRole('status')).toHaveTextContent('Načítám logy…')
  })

  it('vyplněný filtr jde vyčistit jedním tlačítkem', async () => {
    const loadLogs = vi.fn(async () => ({ date: '2026-11-25', count: 0, logs: [] }))
    const user = userEvent.setup()
    renderPanel(loadLogs)

    const search = screen.getByRole('textbox', { name: 'Text' })
    await user.type(search, 'SMTP')
    await user.click(screen.getByRole('button', { name: 'Vyčistit filtry' }))

    expect(search).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Vyčistit filtry' })).not.toBeInTheDocument()
  })
})
