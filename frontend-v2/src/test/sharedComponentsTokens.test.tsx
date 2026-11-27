import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { InstallCard } from '@/components/shared/InstallCard'
import { PromptDialog } from '@/components/shared/PromptDialog'
import { Toast } from '@/components/shared/Toast'
import { recordVisit } from '@/lib/pwaInstall'
import { showToast } from '@/lib/toast'

/**
 * Sdílené komponenty na tokenech a kanonických komponentách (#526, DESIGN.md §2, §6 a §7).
 * Vzhled hlídají guardy (designRules, textAndTouchTokens), tady je chování, které převod změnil.
 */

vi.mock('@/hooks/usePwaInstall', () => ({
  usePwaInstall: () => ({ isStandalone: false, canInstall: 'prompt' }),
}))

describe('dialog s polem (#526, DESIGN.md §7 Formuláře)', () => {
  it('chybu ukáže pod polem s aria-invalid a propojí ji přes aria-describedby', async () => {
    render(
      <PromptDialog isOpen title="Smazat chatu" label="Opiš SMAZAT" errorMessage="Slovo nesedí." onSubmit={vi.fn()} onCancel={vi.fn()} />,
    )

    const input = await screen.findByRole('textbox', { name: 'Opiš SMAZAT' })
    const error = screen.getByRole('alert')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id)
  })

  it('bez chyby pole za neplatné nevydává', async () => {
    render(<PromptDialog isOpen title="Nový seznam" label="Název" onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(await screen.findByRole('textbox', { name: 'Název' })).not.toHaveAttribute('aria-invalid')
  })
})

describe('toast (#526)', () => {
  it('je plná papírová karta a zavírací i kopírovací tlačítko mají dotykový cíl 48 px', async () => {
    render(<Toast />)
    act(() => showToast({ title: 'Rezervaci se nepodařilo uložit.', supportCode: 'ABC123' }, 'error'))

    expect(await screen.findByTestId('toast')).toHaveClass('bg-sheet')
    expect(screen.getByRole('button', { name: 'Zavřít notifikaci' })).toHaveClass('size-(--touch-target-min)')
    expect(screen.getByRole('button', { name: 'Zkopírovat kód chyby' })).toHaveClass('size-(--touch-target-min)')
  })

  it('drží se nad kartou „Co vyzkoušet“ na stagingu (#399)', () => {
    render(<Toast />)
    expect(screen.getByTestId('toast-container').className).toContain('--testing-card-clearance')
  })
})

describe('karta instalace (#526)', () => {
  afterEach(() => localStorage.clear())

  it('je papírová karta jen pro mobil', () => {
    for (let i = 0; i < 3; i++) recordVisit(Date.UTC(2026, 10, 1) + i * 24 * 60 * 60 * 1000)
    render(<InstallCard />)

    const card = screen.getByTestId('install-card')
    expect(card).toHaveClass('bg-sheet', 'md:hidden')
    expect(card).not.toHaveClass('glass-card')
  })
})
