/**
 * api/municipalities.ts — veřejné našeptávání obcí ČR (číselník RÚIAN, ČÚZK) pro výběr nejbližší obce chaty
 */
import apiClient from './client'

// Wire typy zrcadlí src/types.ts (MunicipalityOption, MunicipalitySearchResponse)
export interface MunicipalityOption {
  code: number
  name: string
  district: string
  region: string
}

export interface MunicipalitySearchResponse {
  municipalities: MunicipalityOption[]
}

export const municipalitiesApi = {
  /** Až 10 obcí podle začátku názvu, bez ohledu na diakritiku; dotaz musí mít aspoň 2 znaky. */
  search: async (query: string): Promise<MunicipalityOption[]> => {
    const { data } = await apiClient.get<MunicipalitySearchResponse>('/municipalities', { params: { q: query } })
    return Array.isArray(data?.municipalities) ? data.municipalities : []
  },
}
