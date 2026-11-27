import { MEMBER_PALETTE, toMemberColor } from '@/lib/memberPalette'
import { cn } from '@/lib/utils'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  size?: number
}

/**
 * Výběr barvy člena z ověřené palety (#271). Uložená barva mimo paletu se ukáže jako nejbližší.
 * Kroužek má velikost `size`, dotykový cíl kolem něj aspoň 48 px (DESIGN.md §7, #526).
 */
export function ColorPicker({ value, onChange, size = 32 }: ColorPickerProps) {
  const chosen = toMemberColor(value)

  return (
    <div className="flex flex-wrap gap-2">
      {MEMBER_PALETTE.map(({ hex, name }) => (
        <button
          key={hex}
          type="button"
          className="flex size-12 shrink-0 items-center justify-center rounded-full p-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          onClick={() => onChange(hex)}
          aria-label={name}
          aria-pressed={chosen === hex}
          title={name}
        >
          {/* Barva člena je uložená data (#271), proto inline. Vybraná: tmavý rámeček a uvnitř bílý kroužek (--text-on-primary). */}
          <span
            aria-hidden="true"
            className={cn(
              'rounded-full transition-[border-color,outline-color]',
              chosen === hex
                ? 'border-[3px] border-(--text-main) outline-2 outline-offset-[-5px] outline-(--text-on-primary)'
                : 'border-2 border-transparent',
            )}
            style={{ width: size, height: size, backgroundColor: hex }}
          />
        </button>
      ))}
    </div>
  )
}
