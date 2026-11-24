import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Primitiva `ui/` na našich tokenech (#452, DESIGN.md §6). Testuje se přes veřejné props to, co vidí uživatel
 * a čtečka (role, jméno, stav, focus). Třída se ověřuje jen tam, kde je sama pravidlem (token varianty, cíl 48 px).
 */

describe('Button', () => {
  it.each([
    ['primary', 'bg-primary'],
    ['secondary', 'border-input'],
    ['ghost', 'hover:bg-accent'],
    ['danger', 'bg-destructive'],
  ] as const)('varianta %s je tlačítko s textem na tokenu %s', (variant, tokenClass) => {
    render(<Button variant={variant}>Uložit</Button>)
    const button = screen.getByRole('button', { name: 'Uložit' })
    expect(button.className).toContain(tokenClass)
  })

  it('bez varianty je primární akce', () => {
    render(<Button>Uložit</Button>)
    expect(screen.getByRole('button', { name: 'Uložit' }).className).toContain('bg-primary')
  })

  it('ghost a secondary nemají plnou zelenou ani červenou výplň', () => {
    render(
      <>
        <Button variant="ghost">Zrušit</Button>
        <Button variant="secondary">Zpět</Button>
      </>,
    )
    for (const name of ['Zrušit', 'Zpět']) {
      const { className } = screen.getByRole('button', { name })
      expect(className).not.toMatch(/(^|\s)bg-(primary|destructive)(\s|$)/)
    }
  })

  it.each([
    [undefined, 'min-h-(--touch-target-min)'],
    ['sm', 'min-h-(--touch-target-min)'],
    ['lg', 'min-h-(--touch-target-primary)'],
    ['icon', 'size-(--touch-target-min)'],
  ] as const)('velikost %s má dotykový cíl aspoň 48 px (%s)', (size, targetClass) => {
    render(<Button size={size} aria-label="Akce">A</Button>)
    expect(screen.getByRole('button', { name: 'Akce' }).className).toContain(targetClass)
  })

  it('hlavní akce obrazovky (lg) je plně kulatá', () => {
    render(<Button size="lg">Nová rezervace</Button>)
    expect(screen.getByRole('button', { name: 'Nová rezervace' }).className).toContain('rounded-full')
  })

  it('disabled tlačítko nejde stisknout', async () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Uložit</Button>)
    const button = screen.getByRole('button', { name: 'Uložit' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('pending ukáže spinner, ohlásí zaneprázdnění a nejde odeslat podruhé', async () => {
    const onClick = vi.fn()
    render(<Button pending onClick={onClick}>Ukládám…</Button>)
    const button = screen.getByRole('button', { name: 'Ukládám…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    const spinner = button.querySelector('svg')
    expect(spinner).not.toBeNull()
    expect(spinner).toHaveAttribute('aria-hidden', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('bez pending nemá spinner ani aria-busy', () => {
    render(<Button>Uložit</Button>)
    const button = screen.getByRole('button', { name: 'Uložit' })
    expect(button).not.toHaveAttribute('aria-busy')
    expect(button.querySelector('svg')).toBeNull()
    expect(button).toBeEnabled()
  })

  it('s asChild vykreslí potomka (odkaz) se vzhledem tlačítka', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/rezervace">Rezervace</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Rezervace' })
    expect(link.className).toContain('border-input')
  })

  it('jde na něj focus z klávesnice a Enter ho stiskne', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Uložit</Button>)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Uložit' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('Input', () => {
  it('je textové pole s přístupným jménem z popisku a předá ref', () => {
    const ref = createRef<HTMLInputElement>()
    render(
      <>
        <label htmlFor="name">Název</label>
        <Input id="name" ref={ref} />
      </>,
    )
    const input = screen.getByRole('textbox', { name: 'Název' })
    expect(ref.current).toBe(input)
  })

  it('má dotykový cíl aspoň 48 px', () => {
    render(<Input aria-label="Název" />)
    expect(screen.getByRole('textbox', { name: 'Název' }).className).toContain('min-h-(--touch-target-min)')
  })

  it('bez chyby nemá aria-invalid', () => {
    render(<Input aria-label="Název" />)
    expect(screen.getByRole('textbox', { name: 'Název' })).not.toHaveAttribute('aria-invalid')
  })

  it('chybový stav nastaví aria-invalid, čtečka přečte text chyby přes aria-describedby', () => {
    render(
      <>
        <Input aria-label="E-mail" invalid aria-describedby="email-error" />
        <p id="email-error">Zadej e-mail ve tvaru jmeno@domena.cz.</p>
      </>,
    )
    const input = screen.getByRole('textbox', { name: 'E-mail' })
    expect(input).toBeInvalid()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Zadej e-mail ve tvaru jmeno@domena.cz.')
  })

  it('chybový stav má červený rámeček z tokenu', () => {
    render(<Input aria-label="E-mail" invalid />)
    expect(screen.getByRole('textbox', { name: 'E-mail' }).className).toMatch(/aria-invalid:border-destructive/)
  })

  it('disabled pole nejde upravit', async () => {
    render(<Input aria-label="Název" disabled defaultValue="Chata" />)
    const input = screen.getByRole('textbox', { name: 'Název' })
    expect(input).toBeDisabled()
    await userEvent.type(input, 'x')
    expect(input).toHaveValue('Chata')
  })
})

describe('DropdownMenu – kebab menu nad položkou', () => {
  beforeAll(() => {
    // jsdom nemá rozhraní, která Radix Popper a Menu volají.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    Element.prototype.scrollIntoView ??= () => {}
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.releasePointerCapture ??= () => {}
  })

  function Kebab({ onEdit = vi.fn(), onDelete = vi.fn() }: { onEdit?: () => void; onDelete?: () => void }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Akce s položkou">
            <EllipsisVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden="true" />
            Upravit
          </DropdownMenuItem>
          <DropdownMenuItem variant="danger" onSelect={onDelete}>
            <Trash2 aria-hidden="true" />
            Smazat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  it('otevře se z klávesnice, šipky procházejí položky, Enter vybere', async () => {
    const onDelete = vi.fn()
    render(<Kebab onDelete={onDelete} />)
    const trigger = screen.getByRole('button', { name: 'Akce s položkou' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.tab()
    expect(trigger).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Upravit' })).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Smazat' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('Esc menu zavře a focus se vrátí na tlačítko', async () => {
    render(<Kebab />)
    const trigger = screen.getByRole('button', { name: 'Akce s položkou' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('menu')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('otevře se dotykem a položka se vybere klepnutím', async () => {
    const onEdit = vi.fn()
    render(<Kebab onEdit={onEdit} />)
    const trigger = screen.getByRole('button', { name: 'Akce s položkou' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'touch' })

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Upravit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('položky mají dotykový cíl 48 px, menu je papírová karta nad modálem', async () => {
    render(<Kebab />)
    screen.getByRole('button', { name: 'Akce s položkou' }).focus()
    await userEvent.keyboard('{Enter}')
    const menu = await screen.findByRole('menu')
    expect(menu.className).toContain('bg-sheet')
    expect(menu.className).toContain('z-(--z-dialog)')
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item.className).toContain('min-h-(--touch-target-min)')
    }
  })
})
