import { MEMBER_PALETTE, toMemberColor } from '@/lib/memberPalette'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  size?: number
}

/** Výběr barvy člena z ověřené palety (#271). Uložená barva mimo paletu se ukáže jako nejbližší. */
export function ColorPicker({ value, onChange, size = 32 }: ColorPickerProps) {
  const chosen = toMemberColor(value)

  return (
    <div className="color-picker-grid" style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.5rem',
    }}>
      {MEMBER_PALETTE.map(({ hex, name }) => (
        <button
          key={hex}
          type="button"
          className={`color-swatch${chosen === hex ? ' selected' : ''}`}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            backgroundColor: hex,
            border: chosen === hex ? '3px solid var(--color-text, #1f2937)' : '2px solid transparent',
            cursor: 'pointer',
            outline: chosen === hex ? '2px solid white' : 'none',
            outlineOffset: -3,
            transition: 'border-color 0.15s, outline 0.15s',
            flexShrink: 0,
            padding: 0,
            minWidth: 0,
          }}
          onClick={() => onChange(hex)}
          aria-label={name}
          aria-pressed={chosen === hex}
          title={name}
        />
      ))}
    </div>
  )
}
