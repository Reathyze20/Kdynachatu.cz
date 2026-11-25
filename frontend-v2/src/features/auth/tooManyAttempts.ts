import { formatCount } from '@/lib/format'

interface MaybeHttpError {
  response?: { status?: number; headers?: Record<string, unknown> }
}

/**
 * Hláška pro HTTP 429 na přihlášení, registraci a obnově hesla (#499).
 * Čas bere z `Retry-After` (sekundy, posílá ho express-rate-limit), nespoléhá na tělo odpovědi –
 * to může být holý řetězec nebo HTML z proxy. Pro jinou chybu vrátí `null`.
 */
export function tooManyAttemptsMessage(error: unknown, what: string): string | null {
  const response = (error as MaybeHttpError | null)?.response
  if (response?.status !== 429) return null

  const seconds = Number(response.headers?.['retry-after'])
  const wait = Number.isFinite(seconds) && seconds > 0
    ? `za ${formatCount(Math.ceil(seconds / 60), 'minutu', 'minuty', 'minut')}`
    : 'za chvíli'
  return `${what} Zkus to znovu ${wait}.`
}
