/** api/stagingFeedback.ts — zpětná vazba testera z karty „Co vyzkoušet“ (jen staging, #389), čtení pro správce (#390) */
import apiClient from './client'

// Wire typy zrcadlí src/types.ts (StagingFeedbackTaskId, StagingFeedbackRequest, StagingFeedbackResponse,
// StagingFeedbackRecord, StagingFeedbackListResponse)
export type StagingFeedbackTaskId =
  | 'general' | 'prehled' | 'rezervace' | 'nakup' | 'poznamka-mesic' | 'chat' | 'predavka' | 'galerie'

export interface StagingFeedbackRequest {
  taskId: StagingFeedbackTaskId
  text: string
  screen: string
  viewportWidth: number
}

export interface StagingFeedbackResponse {
  id: string
  createdAt: string
}

export interface StagingFeedbackRecord extends StagingFeedbackRequest {
  id: string
  createdAt: string
  cabinId: string
  userId: string
  username: string
}

export interface StagingFeedbackListResponse {
  feedback: StagingFeedbackRecord[]
}

export const stagingFeedbackApi = {
  send: async (body: StagingFeedbackRequest): Promise<StagingFeedbackResponse> =>
    (await apiClient.post<StagingFeedbackResponse>('/staging-feedback', body)).data,
  /** Jen správce; záznamy jeho chaty od nejnovějších */
  list: async (): Promise<StagingFeedbackRecord[]> =>
    (await apiClient.get<StagingFeedbackListResponse>('/staging-feedback')).data.feedback,
}
