/**
 * api/auth.ts — veřejné auth endpointy
 */
import apiClient from './client'

// Wire typ zrcadlí src/types.ts (SignupStatusResponse)
export interface SignupStatusResponse {
  cabinSignupEnabled: boolean
}

export const authApi = {
  getSignupStatus: async (): Promise<SignupStatusResponse> => {
    const { data } = await apiClient.get<SignupStatusResponse>('/signup-status')
    return data
  },
}
