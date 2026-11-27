/** api/waitlist.ts — veřejný zápis zájemce z landing page (#696, spec #692), bez přihlášení */
import apiClient from './client'

// Wire typy zrcadlí src/types.ts (WaitlistSegment … WaitlistSignupResponse)
export type WaitlistSegment = 'rodina' | 'spolek' | 'firma' | 'pronajimatel' | 'jine'
export type WaitlistHouseholds = '2' | '3-4' | '5+'
export type WaitlistWillingnessToPay = '0' | 'do-500' | '500-1000' | 'nad-1000'
export type WaitlistRentalIntent = 'ne' | 'obcas' | 'ano'
export type WaitlistRentalNeed =
  | 'rezervace-hostu'
  | 'zalohy-platby'
  | 'predani-klicu'
  | 'uklid-mezi-hosty'
  | 'kalendar-booking-airbnb'
  | 'rozpocitani-prijmu'

export interface WaitlistSignupRequest {
  email: string
  segment: WaitlistSegment
  consent: boolean // server přijme jen true
  ref?: string | null
  website?: string
  // Dobrovolné otázky (#699); prázdná odpověď = neuvedeno
  households?: WaitlistHouseholds | null
  willingnessToPay?: WaitlistWillingnessToPay | null
  painPoint?: string | null // nejvýš 1000 znaků
  rentalIntent?: WaitlistRentalIntent | null
  rentalNeeds?: WaitlistRentalNeed[] // server je uloží jen při rentalIntent obcas/ano
}

export interface WaitlistSignupResponse {
  ok: true
}

export const waitlistApi = {
  /** Stejná odpověď i pro duplicitní e-mail; 400 nese chyby polí `{ path, message }[]`. */
  signUp: async (body: WaitlistSignupRequest): Promise<WaitlistSignupResponse> =>
    (await apiClient.post<WaitlistSignupResponse>('/waitlist', body)).data,
}
