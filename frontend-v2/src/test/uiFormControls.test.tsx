import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'

/**
 * Primitiva `Textarea` a `Checkbox` na tokenech (#526, DESIGN.md §6), vzor `Input`. Testuje se přes veřejné props
 * to, co vidí uživatel a čtečka (role, jméno, stav). Třída jen tam, kde je sama pravidlem (cíl 48 px, tokeny).
 */

describe('Textarea', () => {
  it('je víceřádkové pole se jménem z popisku, předá ref a jde do něj psát', async () => {
    const ref = createRef<HTMLTextAreaElement>()
    const onChange = vi.fn()
    render(
      <>
        <label htmlFor="rules">Domácí řád</label>
        <Textarea id="rules" ref={ref} rows={4} onChange={onChange} />
      </>,
    )
    const textarea = screen.getByRole('textbox', { name: 'Domácí řád' })
    expect(ref.current).toBe(textarea)
    expect(textarea).toHaveAttribute('rows', '4')
    expect(textarea).not.toHaveAttribute('aria-invalid')

    await userEvent.type(textarea, 'Zavřít okna')
    expect(onChange).toHaveBeenCalled()
    expect(textarea).toHaveValue('Zavřít okna')
  })

  it('má dotykový cíl aspoň 48 px a písmo 16 px', () => {
    render(<Textarea aria-label="Popis" />)
    const { className } = screen.getByRole('textbox', { name: 'Popis' })
    expect(className).toContain('min-h-(--touch-target-min)')
    expect(className).toContain('text-base')
  })

  it('chybový stav nastaví aria-invalid s červeným rámečkem, čtečka přečte chybu přes aria-describedby', () => {
    render(
      <>
        <Textarea aria-label="Popis" invalid aria-describedby="popis-error" />
        <p id="popis-error">Popis může mít nejvýš 2000 znaků.</p>
      </>,
    )
    const textarea = screen.getByRole('textbox', { name: 'Popis' })
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(textarea).toHaveAccessibleDescription('Popis může mít nejvýš 2000 znaků.')
    expect(textarea.className).toMatch(/aria-invalid:border-destructive/)
  })
})

describe('Checkbox', () => {
  it('je zaškrtávací políčko se jménem z popisku; klepnutí na popisek ho přepne a předá checked', async () => {
    const ref = createRef<HTMLInputElement>()
    const onChange = vi.fn()
    render(
      <label>
        <Checkbox ref={ref} onChange={(e) => onChange(e.target.checked)} />
        <span>Chata je zazimovaná</span>
      </label>,
    )
    const checkbox = screen.getByRole('checkbox', { name: 'Chata je zazimovaná' })
    expect(ref.current).toBe(checkbox)
    expect(checkbox.className).toContain('accent-(--brand-primary)')

    await userEvent.click(screen.getByText('Chata je zazimovaná'))
    expect(checkbox).toBeChecked()
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('disabled políčko nejde přepnout', async () => {
    render(<Checkbox aria-label="Nákupy" disabled />)
    const checkbox = screen.getByRole('checkbox', { name: 'Nákupy' })
    await userEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })
})
