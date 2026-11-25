/**
 * GalleryPage.tsx — Hlavní stránka Galerie
 * View: 'folders' → výběr alba | 'photos' → fotky v albu s lightboxem
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  useGalleryFolders,
  useGalleryPhotos,
  useCreateFolder,
  useRenameFolder,
  useDeleteFolder,
  useDeletePhotos,
} from './hooks/useGallery'
import { FolderGrid, FolderGridSkeleton } from './FolderGrid'
import { PhotoGrid, PhotoGridSkeleton } from './PhotoGrid'
import { Lightbox } from './Lightbox'
import { UploadModal } from './UploadModal'
import { showToast } from '@/lib/toast'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PromptDialog } from '@/components/shared/PromptDialog'
import { useAuth } from '@/context/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { FeatureErrorFallback } from '@/components/shared/FeatureErrorFallback'
import { getNetworkAwareActionMessage } from '@/lib/networkError'
import { isAuthorOrAdmin } from '@/lib/permissions'
import type { GalleryFolder, GalleryPhoto } from '@/api/gallery'

type View = 'folders' | 'photos'

export function GalleryPage() {
  useDocumentTitle('Galerie')
  const { user, isGuest } = useAuth()

  // Stejná pravidla jako backend (#507): album s fotkami smaže autor nebo správce, fotku ten, kdo ji nahrál, nebo správce.
  const canDeleteFolder = (folder: GalleryFolder) =>
    (folder.photoCount ?? 0) === 0 || isAuthorOrAdmin(user, { username: folder.createdBy })
  const canDeletePhoto = (photo: GalleryPhoto) => isAuthorOrAdmin(user, { username: photo.uploadedBy })
  const {
    data: folders = [],
    isLoading: foldersLoading,
    isError: foldersFailed,
    error: foldersError,
    refetch: refetchFolders,
  } = useGalleryFolders()

  // ── View state ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<View>('folders')
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [currentFolderName, setCurrentFolderName] = useState('')

  // ── Search/Sort ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [sortValue, setSortValue] = useState('date-desc')

  // ── Photo state ─────────────────────────────────────────────────────────────
  const {
    data: photos = [],
    isLoading: photosLoading,
    isError: photosFailed,
    error: photosError,
    refetch: refetchPhotos,
  } = useGalleryPhotos(currentFolderId)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set())

  // ── Lightbox ─────────────────────────────────────────────────────────────────
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // ── Modals ───────────────────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null)
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [createFolderError, setCreateFolderError] = useState<string | null>(null)
  const [renameFolderError, setRenameFolderError] = useState<string | null>(null)
  const [deleteFolderError, setDeleteFolderError] = useState<string | null>(null)
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null)

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createFolder = useCreateFolder()
  const renameFolder = useRenameFolder()
  const deleteFolder = useDeleteFolder()
  const deletePhotos = useDeletePhotos(currentFolderId ?? '')

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function openFolder(id: string, name: string) {
    setCurrentFolderId(id)
    setCurrentFolderName(name)
    setIsSelectionMode(false)
    setSelectedPhotos(new Set())
    setView('photos')
  }

  function backToFolders() {
    setView('folders')
    setCurrentFolderId(null)
    setIsSelectionMode(false)
    setSelectedPhotos(new Set())
  }

  function handleTogglePhotoSelect(id: string) {
    setSelectedPhotos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleToggleSelectionMode() {
    setIsSelectionMode(prev => {
      if (prev) setSelectedPhotos(new Set())
      return !prev
    })
  }

  function handleDeleteSelected() {
    if (!selectedPhotos.size) return
    setBulkDeleteError(null)
    setBulkDeleteConfirmOpen(true)
  }

  async function handleConfirmedDeleteSelected() {
    setBulkDeleteError(null)
    try {
      const requested = selectedPhotos.size
      const { deleted } = await deletePhotos.mutateAsync([...selectedPhotos])
      // Server smaže jen fotky, které uživatel smí; hláška říká, co se opravdu stalo.
      if (deleted < requested) {
        const why = user?.role === 'admin' ? 'ostatní už mezitím někdo smazal' : 'ostatní nejsou tvoje'
        showToast(`Smazáno ${deleted} z ${requested}, ${why}.`, 'info')
      } else {
        showToast('Fotky smazány.', 'success')
      }
      setSelectedPhotos(new Set())
      setIsSelectionMode(false)
      setBulkDeleteConfirmOpen(false)
    } catch (error) {
      setBulkDeleteError(
        getNetworkAwareActionMessage(
          error,
          'Vybrané fotky se nepodařilo smazat. Zkus to znovu.',
          'Spojení vypadlo dřív, než se fotky stihly smazat. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  async function handleCreateFolder(name: string) {
    const cleanName = name.trim()
    if (!cleanName) return
    if (cleanName.length > 100) {
      showToast('Název alba je příliš dlouhý (max 100 znaků).', 'error')
      return
    }
    setCreateFolderError(null)
    try {
      await createFolder.mutateAsync(cleanName)
      showToast('Album vytvořeno.', 'success')
      setShowCreateModal(false)
    } catch (error) {
      setCreateFolderError(
        getNetworkAwareActionMessage(
          error,
          'Album se nepodařilo vytvořit. Zkus to znovu.',
          'Spojení vypadlo dřív, než se album stihlo vytvořit. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  function openRenameModal(id: string) {
    const f = folders.find(x => x.id === id)
    if (!f) return
    setRenameFolderError(null)
    setRenameFolderId(id)
    setShowRenameModal(true)
  }

  async function handleRename(name: string) {
    const cleanName = name.trim()
    if (!cleanName || !renameFolderId) return
    if (cleanName.length > 100) {
      showToast('Název alba je příliš dlouhý (max 100 znaků).', 'error')
      return
    }
    if (!name) return
    setRenameFolderError(null)
    try {
      await renameFolder.mutateAsync({ id: renameFolderId, name: cleanName })
      showToast('Přejmenováno.', 'success')
      setRenameFolderId(null)
      setShowRenameModal(false)
    } catch (error) {
      setRenameFolderError(
        getNetworkAwareActionMessage(
          error,
          'Album se nepodařilo přejmenovat. Zkus to znovu.',
          'Spojení vypadlo dřív, než se album stihlo přejmenovat. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  function openDeleteConfirm(id: string) {
    setDeleteFolderError(null)
    setDeleteFolderId(id)
  }

  async function handleConfirmedDeleteFolder() {
    if (!deleteFolderId) return
    setDeleteFolderError(null)
    try {
      await deleteFolder.mutateAsync(deleteFolderId)
      showToast('Album smazáno.', 'success')
      setDeleteFolderId(null)
    } catch (error) {
      setDeleteFolderError(
        getNetworkAwareActionMessage(
          error,
          'Album se nepodařilo smazat. Zkus to znovu.',
          'Spojení vypadlo dřív, než se album stihlo smazat. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  return (
    <div className="gallery-page-wrapper" data-testid="gallery-page">
      <div className="page-card gallery-glass-card">
        <AnimatePresence mode="wait">
          {view === 'folders' ? (
            <motion.div
              key="folders"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="gallery-view-container"
            >
              {foldersLoading ? (
                <FolderGridSkeleton />
              ) : foldersFailed ? (
                <FeatureErrorFallback
                  error={foldersError as Error}
                  resetErrorBoundary={() => {
                    void refetchFolders()
                  }}
                  title="Alba se nepodařilo načíst"
                />
              ) : (
                <FolderGrid
                  folders={folders}
                  searchQuery={searchQuery}
                  sortValue={sortValue}
                  isGuest={isGuest}
                  onSelect={openFolder}
                  onNewFolder={() => setShowCreateModal(true)}
                  onRename={openRenameModal}
                  onDelete={openDeleteConfirm}
                  onSearchChange={setSearchQuery}
                  onSortChange={setSortValue}
                  canDelete={canDeleteFolder}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="photos"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="gallery-view-container"
            >
              {photosLoading ? (
                <PhotoGridSkeleton />
              ) : photosFailed ? (
                <FeatureErrorFallback
                  error={photosError as Error}
                  resetErrorBoundary={() => {
                    void refetchPhotos()
                  }}
                  title="Fotky se nepodařilo načíst"
                />
              ) : (
                <PhotoGrid
                  photos={photos}
                  isSelectionMode={isSelectionMode}
                  selectedPhotos={selectedPhotos}
                  isGuest={isGuest}
                  onOpenLightbox={setLightboxIndex}
                  onToggleSelect={handleTogglePhotoSelect}
                  onToggleSelectionMode={handleToggleSelectionMode}
                  onSelectAll={(ids) => setSelectedPhotos(new Set(ids))}
                  onDeselectAll={() => setSelectedPhotos(new Set())}
                  onDeleteSelected={handleDeleteSelected}
                  onUpload={() => setShowUploadModal(true)}
                  folderName={currentFolderName}
                  onBack={backToFolders}
                  canDeletePhoto={canDeletePhoto}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <PromptDialog
        isOpen={showCreateModal}
        title="Nové album"
        label="Název alba"
        placeholder="Např. Léto 2026"
        maxLength={100}
        submitLabel="Vytvořit"
        loading={createFolder.isPending}
        errorMessage={createFolderError}
        onSubmit={handleCreateFolder}
        onCancel={() => {
          setShowCreateModal(false)
          setCreateFolderError(null)
        }}
      />

      <PromptDialog
        isOpen={showRenameModal}
        title="Přejmenovat album"
        label="Nový název"
        initialValue={folders.find((folder) => folder.id === renameFolderId)?.name ?? ''}
        maxLength={100}
        submitLabel="Přejmenovat"
        loading={renameFolder.isPending}
        errorMessage={renameFolderError}
        onSubmit={handleRename}
        onCancel={() => {
          setRenameFolderId(null)
          setShowRenameModal(false)
          setRenameFolderError(null)
        }}
      />

      {/* ── Delete folder confirm ──────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!deleteFolderId}
        title="Smazat album"
        message={`Opravdu chceš smazat album „${folders.find(f => f.id === deleteFolderId)?.name ?? ''}" a všechny jeho fotky? Tuto akci nelze vrátit.`}
        confirmLabel="Smazat album"
        danger
        loading={deleteFolder.isPending}
        errorMessage={deleteFolderError}
        onConfirm={handleConfirmedDeleteFolder}
        onCancel={() => {
          setDeleteFolderId(null)
          setDeleteFolderError(null)
        }}
      />

      {/* ── Upload modal ───────────────────────────────────────────────────── */}
      {showUploadModal && currentFolderId && (
        <UploadModal
          folderId={currentFolderId}
          onClose={() => setShowUploadModal(false)}
        />
      )}

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightboxIndex !== null && currentFolderId && (
        <Lightbox
          photos={photos}
          initialIndex={lightboxIndex}
          folderId={currentFolderId}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* ── Bulk delete confirm ────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={bulkDeleteConfirmOpen}
        title="Smazat fotky"
        message={`Opravdu chceš smazat ${selectedPhotos.size} vybraných fotek? Tuto akci nelze vrátit.`}
        confirmLabel="Smazat"
        danger
        loading={deletePhotos.isPending}
        errorMessage={bulkDeleteError}
        onConfirm={handleConfirmedDeleteSelected}
        onCancel={() => {
          setBulkDeleteConfirmOpen(false)
          setBulkDeleteError(null)
        }}
      />
    </div>
  )
}
