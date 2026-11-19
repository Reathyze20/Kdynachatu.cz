/**
 * features/auth/hooks/useCabinSignup.ts
 * Jde založit novou chatu? (CABIN_SIGNUP_ENABLED na backendu)
 */
import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/auth'

export const SIGNUP_STATUS_KEY = ['signup-status'] as const

export function useCabinSignup() {
  const query = useQuery({
    queryKey: SIGNUP_STATUS_KEY,
    queryFn: authApi.getSignupStatus,
    staleTime: 5 * 60_000,
  })

  return {
    // Dokud stav neznáme (načítání, chyba), registraci nenabízet – backend ji stejně odmítne.
    signupEnabled: query.data?.cabinSignupEnabled === true,
    isLoading: query.isPending,
  }
}
