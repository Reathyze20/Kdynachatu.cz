/**
 * api/settings.ts — Cabin settings API
 */
import apiClient from './client'
import type { DashboardNotesData } from './dashboard'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CabinConfig {
  id: string
  name: string
  subdomain: string
  description: string | null
  welcomeMessage: string | null
  weatherLocation: string | null // název vybrané obce, u starších chat volný text
  // Nejbližší obec z číselníku RÚIAN (ADR-0006); null = chata obec ještě nevybrala
  municipalityCode: number | null
  municipalityName: string | null
  municipalityDistrict: string | null
  municipalityRegion: string | null
  latitude: number | null
  longitude: number | null
  rules: string | null
  departureChecklist: string[] | null
  /**
   * Titulní fotka ve velikosti pozadí (#321, #340): WebP pro desktop 1920 × 1200,
   * mobilní 1080 × 1920 má stejné jméno s příponou -sm.
   */
  coverPhotoUrl: string | null
  isWinterized: boolean
  features: Record<string, boolean> | null
}

export interface CabinConfigUpdate {
  name?: string
  description?: string | null
  welcomeMessage?: string | null
  /** Kód obce z GET /api/municipalities; null obec smaže. Název, okres a souřadnice doplní server. */
  municipalityCode?: number | null
  rules?: string | null
  departureChecklist?: string[]
  isWinterized?: boolean
  features?: Record<string, boolean>
}

/** PUT /api/cabin/cover-photo – fotka z Galerie vlastní chaty, jen správce. */
export interface SetCabinCoverPhotoRequest {
  photoId: string
}

/** Vzkaz na nástěnce (AppSettings.pinnedHandoverNote) s autorem a časem poslední úpravy. */
export type HandoverNote = Omit<DashboardNotesData, 'latestNotes'>

// ─── API functions ─────────────────────────────────────────────────────────────

export const settingsApi = {
  getCabin: () =>
    apiClient.get<CabinConfig>('/cabin').then((r) => r.data),

  updateCabin: (data: CabinConfigUpdate) =>
    apiClient.patch<CabinConfig>('/cabin', data).then((r) => r.data),

  setCoverPhoto: (data: SetCabinCoverPhotoRequest) =>
    apiClient.put<CabinConfig>('/cabin/cover-photo', data).then((r) => r.data),

  removeCoverPhoto: () =>
    apiClient.delete<CabinConfig>('/cabin/cover-photo').then((r) => r.data),

  updateHandoverNote: (note: string) =>
    apiClient.patch<HandoverNote>('/workspace/handover-note', { note }).then((r) => r.data),
}
