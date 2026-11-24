/** api/stagingFeedback.ts — zpětná vazba testera z karty „Co vyzkoušet“ (jen staging, #389) */
import apiClient from './client'

// Wire typy zrcadlí src/types.ts (StagingFeedbackTaskId, StagingFeedbackRequest, StagingFeedbackResponse)
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

export const stagingFeedbackApi = {
  send: async (body: StagingFeedbackRequest): Promise<StagingFeedbackResponse> =>
    (await apiClient.post<StagingFeedbackResponse>('/staging-feedback', body)).data,
}
