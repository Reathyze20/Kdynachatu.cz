/**
 * useGallery.ts — TanStack Query hooks pro Gallery module
 * Upload fotek po jedné přes multipart/form-data (#515).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { galleryApi } from '@/api/gallery'
import { handleMutationError } from '@/lib/mutationError'
import { isNetworkError } from '@/lib/networkError'

export const GALLERY_FOLDERS_KEY = ['gallery-folders'] as const

export function photosKey(folderId: string) {
  return ['gallery-photos', folderId] as const
}

export function photosByIdsKey(ids: string[]) {
  return ['gallery-photos-ids', ids.join(',')] as const
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useGalleryFolders() {
  return useQuery({
    queryKey: GALLERY_FOLDERS_KEY,
    queryFn: galleryApi.getFolders,
    staleTime: 30_000,
  })
}

export function useGalleryPhotos(folderId: string | null) {
  return useQuery({
    queryKey: photosKey(folderId ?? ''),
    queryFn: () => galleryApi.getPhotos(folderId!),
    enabled: !!folderId,
    staleTime: 30_000,
  })
}

export function usePhotosByIds(ids: string[]) {
  return useQuery({
    queryKey: photosByIdsKey(ids),
    queryFn: () => galleryApi.getPhotosByIds(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  })
}

// ─── Folder mutations ─────────────────────────────────────────────────────────

export function useCreateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => galleryApi.createFolder(name),
    onSuccess: () => void qc.invalidateQueries({ queryKey: GALLERY_FOLDERS_KEY }),
    onError: handleMutationError('Chyba při vytváření alba'),
  })
}

export function useRenameFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => galleryApi.renameFolder(id, name),
    onSuccess: () => void qc.invalidateQueries({ queryKey: GALLERY_FOLDERS_KEY }),
    onError: handleMutationError('Chyba při přejmenování alba'),
  })
}

export function useDeleteFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => galleryApi.deleteFolder(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: GALLERY_FOLDERS_KEY }),
    onError: handleMutationError('Chyba při mazání alba'),
  })
}

// ─── Photo mutations ──────────────────────────────────────────────────────────

export interface PhotoUploadProgress {
  /** Pořadí právě nahrávané fotky od 1. */
  current: number
  total: number
  /** Procenta odeslaných bajtů aktuální fotky, 0–100. */
  percent: number
}

export interface PhotoUploadOutcome {
  uploaded: number
  /** Fotky, které se nenahrály, v původním pořadí – jdou poslat znovu. */
  failed: File[]
  /** Aspoň jedna selhala na výpadku spojení (bez odpovědi serveru). */
  networkFailure: boolean
  /** Modál se zavřel uprostřed dávky; zbytek fotek se už neposlal a je ve `failed`. */
  stopped: boolean
  /** Důvod poslední chyby od serveru (např. příliš velký soubor), když ho server poslal. */
  serverReason?: string
}

const reportUploadError = handleMutationError('Fotku se nepodařilo nahrát', { component: 'GalleryUpload', silent: true })

/**
 * Nahrávání fotek po jedné (#515): každá fotka je samostatný požadavek, takže výpadek signálu
 * shodí jen tu, která se zrovna posílá. Po zavření modálu se další fotky už neposílají.
 */
export function useUploadPhotosOneByOne(folderId: string) {
  const qc = useQueryClient()
  const [progress, setProgress] = useState<PhotoUploadProgress | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const upload = useCallback(
    async (files: File[]): Promise<PhotoUploadOutcome> => {
      const failed: File[] = []
      let uploaded = 0
      let networkFailure = false
      let serverReason: string | undefined
      let stopped = false
      for (const [index, file] of files.entries()) {
        if (!mounted.current) {
          stopped = true
          failed.push(...files.slice(index))
          break
        }
        const step = { current: index + 1, total: files.length }
        setProgress({ ...step, percent: 0 })
        try {
          await galleryApi.uploadPhoto(folderId, file, (fraction) => {
            if (mounted.current) setProgress({ ...step, percent: Math.round(fraction * 100) })
          })
          uploaded++
        } catch (error) {
          failed.push(file)
          if (isNetworkError(error)) {
            networkFailure = true
          } else {
            reportUploadError(error as Error)
            if (axios.isAxiosError<{ message?: string }>(error)) serverReason = error.response?.data?.message ?? serverReason
          }
        }
      }
      if (mounted.current) setProgress(null)
      if (uploaded > 0) {
        void qc.invalidateQueries({ queryKey: photosKey(folderId) })
        void qc.invalidateQueries({ queryKey: GALLERY_FOLDERS_KEY })
      }
      return { uploaded, failed, networkFailure, stopped, serverReason }
    },
    [folderId, qc],
  )

  return { upload, progress, isUploading: progress !== null }
}

export function useUpdatePhoto(folderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, description }: { id: string; description: string }) =>
      galleryApi.updatePhoto(id, description),
    onSuccess: () => void qc.invalidateQueries({ queryKey: photosKey(folderId) }),
    onError: handleMutationError('Chyba při ukládání vzpomínky'),
  })
}

export function useDeletePhoto(folderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => galleryApi.deletePhoto(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: photosKey(folderId) })
      void qc.invalidateQueries({ queryKey: GALLERY_FOLDERS_KEY })
    },
    onError: handleMutationError('Chyba při mazání fotky'),
  })
}

export function useDeletePhotos(folderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => galleryApi.deletePhotos(ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: photosKey(folderId) })
      void qc.invalidateQueries({ queryKey: GALLERY_FOLDERS_KEY })
    },
    onError: handleMutationError('Chyba při mazání fotek'),
  })
}
