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

// Preference Přehledu uložené u uživatele (#681). Chybějící klíč nebo null = výchozí
// (Počasí zapnuté, ostatní bloky vypnuté, scéna animated). Zrcadlí src/types.ts.
export type DashboardSceneMode = 'animated' | 'static'

export interface DashboardPrefs {
  weather?: boolean | null
  cabinScene?: boolean | null
  sinceLast?: boolean | null
  laterAndFree?: boolean | null
  stayForecast?: boolean | null
  regionEvents?: boolean | null
  noticeboard?: boolean | null
  sceneMode?: DashboardSceneMode | null
  simplifiedNoteDismissed?: boolean | null
}

// GET /users/me
export interface UserProfile {
  id: string
  username: string
  email: string | null
  color: string
  animalIcon: string | null
  role: 'admin' | 'user' | 'guest'
  isEmailVerified: boolean
  dashboardPrefs: DashboardPrefs | null
}

// PATCH /users/me (#475): změna e-mailu chce současné heslo. dashboardPrefs se slučuje
// s uloženými, null u klíče ho vrátí na výchozí, null celé = vše výchozí (#681).
export interface UpdateProfileRequest {
  email?: string | null
  color?: string
  animalIcon?: string
  currentPassword?: string
  dashboardPrefs?: DashboardPrefs | null
}

export interface UpdateProfileResponse {
  message: string
  // dashboardPrefs (sloučené uložené hodnoty) server posílá od #681; volitelné kvůli klientům a mockům
  // ze starší verze API. Zdroj pravdy pro čtení je GET /users/me.
  user: { email: string | null; color: string; animalIcon: string | null; dashboardPrefs?: DashboardPrefs | null }
}

/** Klíč dotazu na vlastní profil (`GET /users/me`), sdílí ho šuplík profilu a Přehled. */
export const PROFILE_KEY = ['profile'] as const

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
  getMe: async (): Promise<UserProfile> => {
    const { data } = await apiClient.get<UserProfile>('/users/me')
    return data
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
  /** Uloží změnu preferencí Přehledu; server ji sloučí s uloženými (#681). */
  updateDashboardPrefs: async (dashboardPrefs: DashboardPrefs): Promise<UpdateProfileResponse> => {
    const body: UpdateProfileRequest = { dashboardPrefs }
    const { data } = await apiClient.patch<UpdateProfileResponse>('/users/me', body)
    return data
  },
  /** Zneplatní všechna přihlášení účtu, i to aktuální. */
  logoutEverywhere: async (): Promise<LogoutEverywhereResponse> => {
    const { data } = await apiClient.post<LogoutEverywhereResponse>('/users/me/logout-all')
    return data
  },
  /** Nastaví httpOnly cookie pro fotky z tokenu přihlášené relace (#487); login ji nastavuje sám. */
  syncUploadsCookie: async (): Promise<void> => {
    await apiClient.post('/session-cookie')
  },
  /** Smaže cookie pro fotky (#487). */
  logout: async (): Promise<void> => {
    await apiClient.post('/logout')
  },
}
