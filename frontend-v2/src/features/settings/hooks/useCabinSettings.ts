/**
 * features/settings/hooks/useCabinSettings.ts
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, type CabinConfigUpdate } from '@/api/settings'
import { handleMutationError } from '@/lib/mutationError'

// Use same QK as useCabinFeatures so nav auto-updates after save
export const CABIN_SETTINGS_KEY = ['cabin'] as const
const QK = CABIN_SETTINGS_KEY

export function useCabinSettings() {
  return useQuery({
    queryKey: QK,
    queryFn: settingsApi.getCabin,
    staleTime: 60_000,
  })
}

export function useUpdateCabinSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CabinConfigUpdate) => settingsApi.updateCabin(data),
    onSuccess: (updated) => {
      // Update cache so nav (DesktopSidebar + MobileNav) re-renders with new feature flags
      qc.setQueryData(QK, updated)
    },
    onError: handleMutationError('Nepodařilo se uložit nastavení'),
  })
}

/** Titulní fotka chaty z Galerie (#321); odpověď je nové nastavení chaty. */
export function useSetCoverPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (photoId: string) => settingsApi.setCoverPhoto({ photoId }),
    onSuccess: (updated) => qc.setQueryData(QK, updated),
    onError: handleMutationError('Titulní fotku se nepodařilo nastavit'),
  })
}

export function useRemoveCoverPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: settingsApi.removeCoverPhoto,
    onSuccess: (updated) => qc.setQueryData(QK, updated),
    onError: handleMutationError('Titulní fotku se nepodařilo odebrat'),
  })
}
