/**
 * api/gallery.ts — Types + API functions for Gallery module
 */
import apiClient from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GalleryFolder {
  id: string
  name: string
  photoCount: number
  coverPhotoUrl?: string | null
  createdAt: string
  /** Uživatelské jméno autora; album s fotkami smí smazat autor nebo správce. */
  createdBy?: string
}

/** Odpověď hromadného mazání: server smaže jen fotky, které uživatel smí (#507). */
export interface BulkDeletePhotosResponse {
  message: string
  deleted: number
}

export interface GalleryPhoto {
  id: string
  src: string
  thumb?: string | null
  description?: string | null
  uploadedBy?: string
  folderId: string
  createdAt: string
}

// ─── Folders ──────────────────────────────────────────────────────────────────

export const galleryApi = {
  getFolders: (): Promise<GalleryFolder[]> =>
    apiClient.get<GalleryFolder[]>('/gallery/folders').then(r => r.data),

  createFolder: (name: string): Promise<GalleryFolder> =>
    apiClient.post<GalleryFolder>('/gallery/folders', { name }).then(r => r.data),

  renameFolder: (id: string, name: string): Promise<GalleryFolder> =>
    apiClient.patch<GalleryFolder>(`/gallery/folders/${id}`, { name }).then(r => r.data),

  deleteFolder: (id: string): Promise<void> =>
    apiClient.delete(`/gallery/folders/${id}`).then(() => undefined),

  // ─── Photos ─────────────────────────────────────────────────────────────────

  getPhotos: (folderId: string): Promise<GalleryPhoto[]> =>
    apiClient.get<GalleryPhoto[]>(`/gallery/photos?folderId=${folderId}`).then(r => r.data),

  getPhotosByIds: (ids: string[]): Promise<GalleryPhoto[]> =>
    apiClient.get<GalleryPhoto[]>(`/gallery/photos?ids=${ids.join(',')}`).then(r => r.data),

  /**
   * Nahraje jednu fotku (#515). Endpoint bere i víc fotek naráz, ale jeden výpadek signálu by shodil celou dávku.
   * `onProgress` dostává podíl odeslaných bajtů 0–1.
   */
  uploadPhoto: (folderId: string, file: File, onProgress?: (fraction: number) => void): Promise<GalleryPhoto | undefined> => {
    const fd = new FormData()
    fd.append('folderId', folderId)
    fd.append('photos', file)
    return apiClient
      .post<GalleryPhoto[]>('/gallery/photos', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (onProgress && event.total) onProgress(Math.min(event.loaded / event.total, 1))
        },
      })
      .then(r => r.data[0])
  },

  updatePhoto: (id: string, description: string): Promise<GalleryPhoto> =>
    apiClient.patch<GalleryPhoto>(`/gallery/photos/${id}`, { description }).then(r => r.data),

  deletePhoto: (id: string): Promise<void> =>
    apiClient.delete(`/gallery/photos/${id}`).then(() => undefined),

  deletePhotos: (photoIds: string[]): Promise<BulkDeletePhotosResponse> =>
    apiClient.delete<BulkDeletePhotosResponse>('/gallery/photos', { data: { photoIds } }).then(r => r.data),
}
