/**
 * lib/utils.ts — Utility funkce
 * cn() = clsx + tailwind-merge (shadcn/ui standard)
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDate as formatFullDate, monthName } from './format'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => monthName(i).replace(/^./, (c) => c.toUpperCase()))

export { MONTH_NAMES }

/** Formats ISO date "YYYY-MM-DD" → "21. 3. 2026" (lib/format.ts, DESIGN.md §9) */
export function formatDate(iso: string): string {
  return formatFullDate(iso)
}

/** Formats ISO timestamp → relative time string */
export function timeAgo(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60) return 'Před chvílí'
  if (diff < 3600) return `Před ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Před ${Math.floor(diff / 3600)} hod`
  if (diff < 604800) return `Před ${Math.floor(diff / 86400)} dny`
  return formatDate(isoString.slice(0, 10))
}

/** Escapes HTML entities (for safe innerHTML insertion) */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ─── Constants ─────────────────────────────────────────────────────────────────

export const ANIMAL_EMOJIS = [
  '🐻','🦊','🐼','🐨','🐯','🦁','🐸','🐧','🦆','🦅',
  '🦉','🦋','🐢','🦎','🐙','🦀','🐬','🐳','🦈','🐘',
  '🦒','🦓','🦏','🦛','🐪','🦘','🦙','🦔','🐿️','🦡',
]
