import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { LogsPanel } from '@/components/shared/LogsPanel'

/** Seznam logů na tokenech (#526, #527): souhrn úrovní, řádek záznamu a rozbalený detail. Fiktivní data. */

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <LogsPanel
        scopeKey="test-logs"
        eyebrow="Diagnostika"
        title="Systémové logy"
        description="Záznamy aplikace"
        loadLogFiles={async () => ({ files: ['2026-11-25'] })}
        loadLogs={async () => ({
          date: '2026-11-25',
          count: 3,
          logs: [
            { level: 'error', msg: 'SMTP neodpovídá', module: 'INVITES', requestId: 'req-1' },
            { level: 'warn', msg: 'Pomalý dotaz' },
            { level: 'info', msg: 'Start serveru' },
          ],
        })}
      />
    </QueryClientProvider>,
  )
}

describe('seznam logů (#526, #527)', () => {
  it('souhrn spočítá úrovně; záznam ukáže úroveň, zprávu a údaje a po klepnutí rozbalí detail', async () => {
    renderPanel()
    expect(await screen.findByTestId('logs-summary')).toHaveTextContent(/1 error.*1 warn.*1 info/)
    const [entry] = screen.getAllByTestId('log-entry')
    expect(entry).toHaveTextContent(/Error.*SMTP neodpovídá.*Modul: INVITES/)
    expect(entry).not.toHaveAttribute('open')

    await userEvent.click(within(entry).getByText('SMTP neodpovídá'))
    expect(entry).toHaveAttribute('open')
    expect(within(entry).getByText(/"requestId": "req-1"/)).toBeVisible()
  })
})
