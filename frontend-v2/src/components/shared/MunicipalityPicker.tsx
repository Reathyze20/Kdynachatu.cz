/**
 * components/shared/MunicipalityPicker.tsx
 * Výběr nejbližší obce chaty ze seznamu obcí ČR (ADR-0006: appka zná polohu chaty jen na úrovni obce).
 *
 * Hodnotou je jen obec vybraná ze seznamu – psaní po výběru ji zruší. Napsaný text bez výběru
 * nastaví inputu chybu validace („Vyber obec ze seznamu.“), takže ho formulář s nativní validací
 * neodešle. Formulář s `noValidate` hlídá `value === null` sám; napsaný text bez výběru mu ohlásí `onPendingChange`.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { MunicipalityOption } from '@/api/municipalities'
import { Input } from '@/components/ui/input'
import { useMunicipalitySearch } from '@/hooks/useMunicipalitySearch'

interface MunicipalityPickerProps {
  /** id inputu, na který míří `<label htmlFor>` rodiče */
  id: string
  value: MunicipalityOption | null
  onChange: (municipality: MunicipalityOption | null) => void
  /** true, když je v poli napsaný text bez výběru ze seznamu (pro formuláře s `noValidate`) */
  onPendingChange?: (pending: boolean) => void
  placeholder?: string
  required?: boolean
  testId?: string
}

/** Okres (a u dvou stejnojmenných obcí v jednom okrese i kód RÚIAN), aby šly obce rozlišit. */
function describe(m: MunicipalityOption, ambiguous: boolean): string {
  return `okres ${m.district}${ambiguous ? `, kód obce ${m.code}` : ''}`
}

const NOT_PICKED = 'Vyber obec ze seznamu.'

export function MunicipalityPicker({ id, value, onChange, onPendingChange, placeholder = 'Začni psát název obce', required, testId }: MunicipalityPickerProps) {
  const listId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value ? `${value.name} (${describe(value, false)})` : '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const { results, hasFinalResults } = useMunicipalitySearch(value ? '' : text)

  // Hodnota nastavená zvenku: načtené nastavení chaty se propíše do inputu, reset na null ho vyprázdní.
  const shownValue = useRef(value)
  useEffect(() => {
    if (value && value.code !== shownValue.current?.code) setText(`${value.name} (${describe(value, false)})`)
    if (!value && shownValue.current && text === `${shownValue.current.name} (${describe(shownValue.current, false)})`) setText('')
    shownValue.current = value
  }, [value, text])

  const pending = text.trim() !== '' && !value
  useEffect(() => {
    inputRef.current?.setCustomValidity(pending ? NOT_PICKED : '')
    onPendingChange?.(pending)
  }, [pending, onPendingChange])

  const isAmbiguous = (m: MunicipalityOption) =>
    results.some((other) => other.code !== m.code && other.name === m.name && other.district === m.district)
  const showList = open && !value && results.length > 0
  const showEmpty = open && !value && hasFinalResults && results.length === 0

  function pick(m: MunicipalityOption) {
    shownValue.current = m
    setText(`${m.name} (${describe(m, isAmbiguous(m))})`)
    onChange(m)
    setOpen(false)
    setActive(-1)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && showList && active >= 0) {
      e.preventDefault()
      pick(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="text"
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={hintId}
        autoComplete="off"
        maxLength={100}
        placeholder={placeholder}
        required={required}
        value={text}
        onFocus={(e) => value && e.target.select()}
        onChange={(e) => {
          // Úprava vybrané obce hledá dál podle názvu, ne podle „(okres …)“ za ním.
          setText(value ? e.target.value.replace(/\s*\(okres[^]*$/, '') : e.target.value)
          setOpen(true)
          setActive(-1)
          if (value) onChange(null)
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        data-testid={testId}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-(--z-dropdown) mt-1 max-h-64 w-full overflow-auto rounded-xl border border-rule-soft bg-sheet py-1 shadow-lift"
        >
          {results.map((m, i) => (
            <li
              key={m.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex min-h-(--touch-target-min) cursor-pointer flex-col justify-center px-3 py-2 ${i === active ? 'bg-accent' : 'hover:bg-(--bg-hover)'}`}
              // mousedown by jinak inputu sebral focus dřív, než se klik stihne zpracovat
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(m)}
            >
              <span className="text-body font-medium text-(--text-main)">{m.name}</span>
              <span className="text-meta text-(--text-muted)">{describe(m, isAmbiguous(m))} · {m.region}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-meta text-(--text-muted) empty:mt-0" role="status">
        {showEmpty ? 'Žádná obec tomu neodpovídá. Zkus jiný začátek názvu.' : ''}
      </p>
      <span id={hintId} className="mt-1 block text-meta text-(--text-muted)">
        Vyber obec ze seznamu, za názvem můžeš napsat i okres.
      </span>
    </div>
  )
}
