/**
 * features/auth/hooks/useDemoAccounts.ts
 * Fiktivní účty pro rychlé přihlášení – backend je vrací jen na stagingu, jinde prázdný seznam.
 */
import { useQuery } from '@tanstack/react-query'
import { authApi, type DemoAccount } from '@/api/auth'

export const DEMO_ACCOUNTS_KEY = ['demo-accounts'] as const

export function useDemoAccounts(): DemoAccount[] {
  const query = useQuery({
    queryKey: DEMO_ACCOUNTS_KEY,
    queryFn: authApi.getDemoAccounts,
    staleTime: Infinity,
    retry: false,
  })
  return query.data ?? []
}
