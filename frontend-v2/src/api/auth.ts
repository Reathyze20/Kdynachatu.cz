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

// PATCH /users/me (#475): změna e-mailu chce současné heslo
export interface UpdateProfileRequest {
  email?: string | null
  color?: string
  animalIcon?: string
  currentPassword?: string
}

export interface UpdateProfileResponse {
  message: string
  user: { email: string | null; color: string; animalIcon: string | null }
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
  /** Změní e-mail účtu; server ověří současné heslo a na starou adresu pošle upozornění. */
  changeMyEmail: async (email: string, currentPassword: string): Promise<UpdateProfileResponse> => {
    const body: UpdateProfileRequest = { email, currentPassword }
    const { data } = await apiClient.patch<UpdateProfileResponse>('/users/me', body)
    return data
  },
  /** Zneplatní všechna přihlášení účtu, i to aktuální. */
  logoutEverywhere: async (): Promise<LogoutEverywhereResponse> => {
    const { data } = await apiClient.post<LogoutEverywhereResponse>('/users/me/logout-all')
    return data
  },
}
