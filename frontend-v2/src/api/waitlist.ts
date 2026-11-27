/** api/waitlist.ts — veřejný zápis zájemce z landing page (#696, spec #692), bez přihlášení */
import apiClient from './client'

// Wire typy zrcadlí src/types.ts (WaitlistSegment, WaitlistSignupRequest, WaitlistSignupResponse)
export type WaitlistSegment = 'rodina' | 'spolek' | 'firma' | 'pronajimatel' | 'jine'

export interface WaitlistSignupRequest {
  email: string
  segment: WaitlistSegment
  consent: boolean // server přijme jen true
  ref?: string | null
  website?: string
}

export interface WaitlistSignupResponse {
  ok: true
}

export const waitlistApi = {
  /** Stejná odpověď i pro duplicitní e-mail; 400 nese chyby polí `{ path, message }[]`. */
  signUp: async (body: WaitlistSignupRequest): Promise<WaitlistSignupResponse> =>
    (await apiClient.post<WaitlistSignupResponse>('/waitlist', body)).data,
}
