import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { Select } from '@/components/ui/select'
import { LogsPanel } from '@/components/shared/LogsPanel'

/**
 * Primitivum `Select` na tokenech (#651, DESIGN.md §6), vzor `Input`. Testuje se přes veřejné props to, co vidí
 * uživatel a čtečka (role, jméno, stav); třída jen tam, kde je sama pravidlem (cíl 48 px, písmo 16 px).
 */

describe('Select', () => {
  it('je výběr se jménem z popisku, předá ref a vybraná volba dorazí do onChange', async () => {
    const ref = createRef<HTMLSelectElement>()
    const onChange = vi.fn()
    render(
      <>
        <label htmlFor="range">Rozsah</label>
        <Select id="range" ref={ref} defaultValue="50" onChange={(e) => onChange(e.target.value)}>
          <option value="50">50 řádků</option>
          <option value="100">100 řádků</option>
        </Select>
      </>,
    )
    const select = screen.getByRole('combobox', { name: 'Rozsah' })
    expect(ref.current).toBe(select)
    expect(select).not.toHaveAttribute('aria-invalid')

    await userEvent.selectOptions(select, '100')
    expect(onChange).toHaveBeenCalledWith('100')
    expect(select).toHaveValue('100')
  })

  it('className dostane obal, takže šipka zůstane v poli i u užšího výběru', () => {
    render(<Select aria-label="Zdroj" className="md:w-48"><option>Vše</option></Select>)
    const select = screen.getByRole('combobox', { name: 'Zdroj' })
    expect(select.parentElement).toHaveClass('relative', 'md:w-48')
    expect(select).not.toHaveClass('md:w-48')
  })

  it('má dotykový cíl aspoň 48 px, písmo 16 px a šipku jen pro oko', () => {
    const { container } = render(<Select aria-label="Úroveň"><option>Vše</option></Select>)
    const { className } = screen.getByRole('combobox', { name: 'Úroveň' })
    expect(className).toContain('min-h-(--touch-target-min)')
    expect(className).toContain('text-base')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('chybový stav nastaví aria-invalid s červeným rámečkem, čtečka přečte chybu přes aria-describedby', () => {
    render(
      <>
        <Select aria-label="Role" invalid aria-describedby="role-error"><option value="">Vyber</option></Select>
        <p id="role-error">Vyber roli.</p>
      </>,
    )
    const select = screen.getByRole('combobox', { name: 'Role' })
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Vyber roli.')
    expect(select.className).toMatch(/aria-invalid:border-destructive/)
  })

  it('disabled výběr nejde změnit', async () => {
    const onChange = vi.fn()
    render(<Select aria-label="Den" disabled onChange={onChange}><option>Dnes</option><option>Včera</option></Select>)
    const select = screen.getByRole('combobox', { name: 'Den' })
    await userEvent.selectOptions(select, 'Včera')
    expect(select).toBeDisabled()
    expect(select).toHaveValue('Dnes')
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('filtry panelu logů (#651)', () => {
  it('všechny čtyři výběry jsou primitivum Select s cílem 48 px', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <LogsPanel
          scopeKey="test-logs"
          eyebrow="Diagnostika"
          title="Systémové logy"
          description="Záznamy aplikace"
          loadLogFiles={async () => ({ files: ['2026-11-25'] })}
          loadLogs={async () => ({ date: '2026-11-25', count: 0, logs: [] })}
        />
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('option', { name: '2026-11-25' })).toBeInTheDocument()
    for (const name of ['Den', 'Úroveň', 'Zdroj', 'Rozsah']) {
      expect(screen.getByRole('combobox', { name }).className, name).toContain('min-h-(--touch-target-min)')
    }
  })
})
