/**
 * api/auth.ts — veřejné auth endpointy
 */
import apiClient from './client'

// Wire typy zrcadlí src/types.ts (SignupStatusResponse, DemoAccount, DemoAccountsResponse)
export interface SignupStatusResponse {
  cabinSignupEnabled: boolean
}

export interface DemoAccount {
  username: string
  label: string
  role: string
  password: string
}

export interface DemoAccountsResponse {
  accounts: DemoAccount[]
}

export const authApi = {
  getSignupStatus: async (): Promise<SignupStatusResponse> => {
    const { data } = await apiClient.get<SignupStatusResponse>('/signup-status')
    return data
  },
  /** Neprázdné jen na stagingu (fiktivní účty ze seedu). */
  getDemoAccounts: async (): Promise<DemoAccount[]> => {
    const { data } = await apiClient.get<DemoAccountsResponse>('/demo-accounts')
    return Array.isArray(data?.accounts) ? data.accounts : []
  },
}
