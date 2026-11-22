/**
 * components/shared/MunicipalityPicker.tsx
 * Výběr nejbližší obce chaty ze seznamu obcí ČR (ADR-0006: appka zná polohu chaty jen na úrovni obce).
 * Hodnotou je jen obec vybraná ze seznamu – psaní po výběru ji zruší, volný text se nikdy neuloží.
 */
import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import type { MunicipalityOption } from '@/api/municipalities'
import { useMunicipalitySearch } from '@/hooks/useMunicipalitySearch'

interface MunicipalityPickerProps {
  /** id inputu, na který míří `<label htmlFor>` rodiče */
  id: string
  value: MunicipalityOption | null
  onChange: (municipality: MunicipalityOption | null) => void
  placeholder?: string
  required?: boolean
  testId?: string
}

function formatMunicipality(m: MunicipalityOption): string {
  return `${m.name} (okres ${m.district})`
}

export function MunicipalityPicker({ id, value, onChange, placeholder = 'Začni psát název obce', required, testId }: MunicipalityPickerProps) {
  const listId = useId()
  const [text, setText] = useState(value ? formatMunicipality(value) : '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const { results, isSettled } = useMunicipalitySearch(value ? '' : text)

  // Hodnota nastavená zvenku (načtené nastavení chaty) se propíše do inputu.
  useEffect(() => {
    if (value) setText(formatMunicipality(value))
  }, [value])

  const showList = open && !value && results.length > 0
  const showEmpty = open && !value && isSettled && results.length === 0

  function pick(m: MunicipalityOption) {
    onChange(m)
    setText(formatMunicipality(m))
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
      <input
        type="text"
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        maxLength={100}
        placeholder={placeholder}
        required={required}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
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
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-md"
        >
          {results.map((m, i) => (
            <li
              key={m.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-2 ${i === active ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
              // mousedown by jinak inputu sebral focus dřív, než se klik stihne zpracovat
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(m)}
            >
              <span className="font-medium text-slate-900">{m.name}</span>
              <span className="text-sm text-slate-600">okres {m.district} · {m.region}</span>
            </li>
          ))}
        </ul>
      )}
      {showEmpty && (
        <p className="mt-1 text-sm text-slate-600" role="status">
          Žádná obec tomu neodpovídá. Zkus jiný začátek názvu.
        </p>
      )}
      <span className="mt-1 block text-xs text-slate-600">
        Vyber obec ze seznamu, za názvem můžeš napsat i okres. Seznam obcí: ČÚZK (RÚIAN), CC BY 4.0.
      </span>
    </div>
  )
}
