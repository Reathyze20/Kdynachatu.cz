/**
 * api/auth.ts — veřejné auth endpointy a přihlášení vlastního účtu (heslo, „Odhlásit všude“)
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

// Zrcadlí src/types.ts ChangeMyPasswordResponse a LogoutEverywhereResponse (#485)
export interface ChangeMyPasswordResponse {
  message: string
  /** Nový token aktuálního zařízení; všechny dřívější tokeny přestaly platit. */
  token: string
}

export interface LogoutEverywhereResponse {
  message: string
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
  changeMyPassword: async (oldPassword: string, newPassword: string): Promise<ChangeMyPasswordResponse> => {
    const { data } = await apiClient.patch<ChangeMyPasswordResponse>('/users/me/password', { oldPassword, newPassword })
    return data
  },
  /** Zneplatní všechna přihlášení účtu, i to aktuální. */
  logoutEverywhere: async (): Promise<LogoutEverywhereResponse> => {
    const { data } = await apiClient.post<LogoutEverywhereResponse>('/users/me/logout-all')
    return data
  },
}
