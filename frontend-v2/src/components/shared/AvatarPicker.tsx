import { AVATARS } from '@/lib/avatars'
import { AnimalAvatar } from '@/components/shared/AnimalAvatar'
import { cn } from '@/lib/utils'

interface AvatarPickerProps {
  value: string
  onChange: (avatarId: string) => void
  compact?: boolean
}

/** Výběr avatara člena. Každá volba má dotykový cíl aspoň 48 px a vybraná je `aria-pressed` (DESIGN.md §7, #526). */
export function AvatarPicker({ value, onChange, compact }: AvatarPickerProps) {
  return (
    <div
      className={cn(
        'grid',
        compact ? 'grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-1' : 'grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2',
      )}
    >
      {AVATARS.map((avatar) => {
        const chosen = value === avatar.id
        return (
          <button
            key={avatar.id}
            type="button"
            title={avatar.label}
            aria-label={avatar.label}
            aria-pressed={chosen}
            className={cn(
              'flex items-center justify-center border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              compact ? 'size-12 rounded-lg p-0.5' : 'size-13 rounded-xl p-1',
              chosen ? 'border-primary bg-accent' : 'border-transparent bg-sheet hover:bg-(--bg-hover)',
            )}
            onClick={() => onChange(avatar.id)}
          >
            <AnimalAvatar icon={avatar.id} username={avatar.label} size={compact ? 32 : 40} />
          </button>
        )
      })}
    </div>
  )
}
