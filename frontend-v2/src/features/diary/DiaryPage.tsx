/**
 * DiaryPage.tsx — Hlavní stránka Deníku pobytů
 * View: 'folders' → seznam pobytů | 'entries' → kalendář dnů
 */
import { useState, useMemo } from 'react'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import {
  useDiaryFolders,
  useDiaryEntries,
  useCreateDiaryFolder,
  useRenameDiaryFolder,
  useDeleteDiaryFolder,
  useReservations,
} from './hooks/useDiary'
import type { DiaryFolder, DiaryEntry } from '@/api/diary'
import { DiaryFolders } from './DiaryFolders'
import { DiaryCalendar } from './DiaryCalendar'
import { NotebookModal } from './NotebookModal'
import { showToast } from '@/lib/toast'
import { useAuth } from '@/context/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { PromptDialog } from '@/components/shared/PromptDialog'
import { FeatureErrorFallback } from '@/components/shared/FeatureErrorFallback'
import { getNetworkAwareActionMessage } from '@/lib/networkError'
import { isAuthorOrAdmin } from '@/lib/permissions'
import { formatDateRange } from '@/lib/format'
import { formatStayRange } from '@/lib/dateUtils'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/shared/Card'
import { PageHeader } from '@/components/shared/PageHeader'

type View = 'folders' | 'entries'

interface NotebookState {
  dateObj: Date
  entry: DiaryEntry | undefined
}

const ACTIVITY_TAG_OPTIONS = [
  { value: '', label: 'Bez typu' },
  { value: 'relax', label: 'Relaxace' },
  { value: 'party', label: 'Oslava' },
  { value: 'work', label: 'Práce na chatě' },
  { value: 'mushroom', label: 'Houbaření' },
  { value: 'hike', label: 'Turistika' },
  { value: 'family', label: 'Rodinné sezení' },
]

export function DiaryPage() {
  useDocumentTitle('Deník');
  const { user } = useAuth()

  const {
    data: folders = [],
    isLoading: foldersLoading,
    isError: foldersFailed,
    error: foldersError,
    refetch: refetchFolders,
  } = useDiaryFolders()
  const [view, setView] = useState<View>('folders')
  const [currentFolder, setCurrentFolder] = useState<DiaryFolder | null>(null)

  const {
    data: entries = [],
    isLoading: entriesLoading,
    isError: entriesFailed,
    error: entriesError,
    refetch: refetchEntries,
  } = useDiaryEntries(currentFolder?.id ?? null)

  // ── Notebook ──────────────────────────────────────────────────────────────
  const [notebookState, setNotebookState] = useState<NotebookState | null>(null)

  // ── Modals ────────────────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createStartDate, setCreateStartDate] = useState('')
  const [createEndDate, setCreateEndDate] = useState('')
  const [createTag, setCreateTag] = useState('')
  const [createFromReservation, setCreateFromReservation] = useState('')

  const [renameTarget, setRenameTarget] = useState<DiaryFolder | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<DiaryFolder | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createFolder = useCreateDiaryFolder()
  const renameFolder = useRenameDiaryFolder()
  const deleteFolder = useDeleteDiaryFolder()

  // ── Reservations for create modal ─────────────────────────────────────────
  const { data: reservations = [] } = useReservations()
  const myReservations = useMemo(
    () => reservations.filter(r => r.userId === user?.userId)
      .sort((a, b) => new Date(b.from).getTime() - new Date(a.from).getTime()),
    [reservations, user?.userId]
  )

  // ── allDates for notebook navigation ─────────────────────────────────────
  const allDates = useMemo((): string[] => {
    if (!currentFolder?.startDate || !currentFolder?.endDate) return []
    const dates: string[] = []
    const start = new Date(currentFolder.startDate); start.setHours(0,0,0,0)
    const end   = new Date(currentFolder.endDate);   end.setHours(0,0,0,0)
    const cur = new Date(start)
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    return dates
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolder?.id])

  // entryByDate Map for notebook navigation
  const entryByDate = useMemo(() => {
    const m = new Map<string, DiaryEntry>()
    for (const e of entries) m.set(e.date.slice(0, 10), e)
    return m
  }, [entries])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openFolder(folder: DiaryFolder) {
    setCurrentFolder(folder)
    setView('entries')
    setNotebookState(null)
  }

  function backToFolders() {
    setView('folders')
    setCurrentFolder(null)
    setNotebookState(null)
  }

  function openNotebook(dateObj: Date, entry: DiaryEntry | undefined) {
    setNotebookState({ dateObj, entry })
  }

  // Called from NotebookModal when prev/next is pressed (after auto-save)
  function handleNotebookNavigate(newDate: Date) {
    const key = newDate.toISOString().slice(0, 10)
    const newEntry = entryByDate.get(key)
    setNotebookState({ dateObj: newDate, entry: newEntry })
  }

  function handleNotebookSaved() {
    setNotebookState(null)
  }

  // ── Create folder ──────────────────────────────────────────────────────────

  function openCreateModal() {
    setCreateName(''); setCreateStartDate(''); setCreateEndDate(''); setCreateTag(''); setCreateFromReservation('')
    setCreateError(null)
    setShowCreateModal(true)
  }

  function closeCreateModal() {
    setShowCreateModal(false)
    setCreateError(null)
  }

  function handleReservationSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    setCreateFromReservation(id)
    if (!id) return
    const res = myReservations.find(r => r.id === id)
    if (!res) return
    setCreateName(res.purpose || '')
    setCreateStartDate(res.from.slice(0, 10))
    setCreateEndDate(res.to.slice(0, 10))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = createName.trim()
    if (!name) return
    setCreateError(null)
    try {
      await createFolder.mutateAsync({ name, startDate: createStartDate || '', endDate: createEndDate || '', activityTag: createTag || null })
      showToast('Pobyt vytvořen.', 'success')
      setShowCreateModal(false)
    } catch (error) {
      setCreateError(
        getNetworkAwareActionMessage(
          error,
          'Pobyt se nepodařilo vytvořit. Zkus to znovu.',
          'Spojení vypadlo dřív, než se pobyt stihl vytvořit. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  // ── Rename ──────────────────────────────────────────────────────────────────

  function openRenameModal(folder: DiaryFolder) {
    setRenameError(null)
    setRenameTarget(folder)
  }

  async function handleRename(name: string) {
    const cleanName = name.trim()
    if (!renameTarget || !cleanName) return
    setRenameError(null)
    try {
      await renameFolder.mutateAsync({ id: renameTarget.id, name: cleanName })
      showToast('Přejmenováno.', 'success')
      setRenameTarget(null)
    } catch (error) {
      setRenameError(
        getNetworkAwareActionMessage(
          error,
          'Pobyt se nepodařilo přejmenovat. Zkus to znovu.',
          'Spojení vypadlo dřív, než se pobyt stihl přejmenovat. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  function openDeleteModal(folder: DiaryFolder) {
    setDeleteError(null)
    setDeleteTarget(folder)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteFolder.mutateAsync(deleteTarget.id)
      showToast('Pobyt smazán.', 'success')
      setDeleteTarget(null)
    } catch (error) {
      setDeleteError(
        getNetworkAwareActionMessage(
          error,
          'Pobyt se nepodařilo smazat. Zkus to znovu.',
          'Spojení vypadlo dřív, než se pobyt stihl smazat. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  return (
    <div className="flex flex-col gap-4 p-3 md:gap-6 md:p-0" data-testid="diary-page">
      <Card className="shrink-0">
        {view === 'entries' && currentFolder ? (
          <PageHeader
            title={currentFolder.name}
            subtitle={currentFolder.startDate ? formatStayRange(currentFolder.startDate, currentFolder.endDate) : undefined}
            onBack={backToFolders}
          />
        ) : (
          <PageHeader
            title="Deník pobytů"
            subtitle="Záznamy z pobytů na chatě"
            primaryAction={{ label: 'Nový pobyt', icon: Plus, onClick: openCreateModal }}
          />
        )}
      </Card>

      {/* Dny pobytu mají zatím vlastní odsazení z diary.css (převod dne zbývá z #520), proto karta bez něj. */}
      <Card flush={view === 'entries'} className={view === 'entries' ? 'overflow-hidden' : undefined}>
        {/* ── FOLDERS VIEW ─────────────────────────────────────────────── */}
        {view === 'folders' && (
          foldersLoading ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex min-h-28 flex-col gap-2 rounded-xl bg-inset p-4">
                  <div className="skeleton skeleton-title" />
                  <div className="skeleton skeleton-text medium" />
                </div>
              ))}
            </div>
          ) : foldersFailed ? (
            <FeatureErrorFallback
              error={foldersError as Error}
              resetErrorBoundary={() => {
                void refetchFolders()
              }}
              title="Pobyty se nepodařilo načíst"
              bare
            />
          ) : (
            <DiaryFolders
              folders={folders}
              onOpen={openFolder}
              onRename={openRenameModal}
              onDelete={openDeleteModal}
              onNewFolder={openCreateModal}
              canManage={(folder) => isAuthorOrAdmin(user, { username: folder.createdBy })}
            />
          )
        )}

        {/* ── ENTRIES / CALENDAR VIEW ──────────────────────────────────── */}
        {view === 'entries' && currentFolder && (
          <div className="diary-entries-view">
            {entriesLoading ? (
              <div className="spinner-container"><div className="spinner" /></div>
            ) : entriesFailed ? (
              <FeatureErrorFallback
                error={entriesError as Error}
                resetErrorBoundary={() => {
                  void refetchEntries()
                }}
                title="Zápisky se nepodařilo načíst"
                bare
              />
            ) : (
              <DiaryCalendar
                folder={currentFolder}
                entries={entries}
                onOpenNotebook={openNotebook}
              />
            )}
          </div>
        )}

      </Card>

      {/* ── Create folder modal ─────────────────────────────────────────── */}
      {showCreateModal && (
        <Modal
          isOpen={true}
          onClose={closeCreateModal}
          title="Nový pobyt"
          maxWidth="max-w-md"
          footer={
            <div className="modal-dialog-actions">
              <Button type="button" variant="secondary" onClick={closeCreateModal} disabled={createFolder.isPending}>Zrušit</Button>
              <Button type="submit" form="create-diary-form" pending={createFolder.isPending}>
                {createFolder.isPending ? 'Vytvářím…' : 'Vytvořit'}
              </Button>
            </div>
          }
        >
          <form id="create-diary-form" className="flex flex-col" onSubmit={handleCreate}>
            {myReservations.length > 0 && (
              <div className="form-group">
                <label htmlFor="reservation-select">Načíst z rezervace (nepovinné)</label>
                <select id="reservation-select" value={createFromReservation} onChange={handleReservationSelect}>
                  <option value="">Vyber rezervaci</option>
                  {myReservations.map(r => (
                    <option key={r.id} value={r.id}>
                      {formatDateRange(r.from.slice(0, 10), r.to.slice(0, 10))}{r.purpose ? ` (${r.purpose})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="diary-folder-name">Název pobytu</label>
              <Input id="diary-folder-name" type="text" value={createName} onChange={e => setCreateName(e.target.value)} required maxLength={100} autoFocus />
            </div>
            <div className="form-group">
              <label htmlFor="diary-start-date">Od (nepovinné)</label>
              <Input id="diary-start-date" type="date" value={createStartDate} onChange={e => setCreateStartDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="diary-end-date">Do (nepovinné)</label>
              <Input id="diary-end-date" type="date" value={createEndDate} onChange={e => setCreateEndDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="activity-tag">Typ pobytu (nepovinné)</label>
              <select id="activity-tag" value={createTag} onChange={e => setCreateTag(e.target.value)}>
                {ACTIVITY_TAG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {createError ? (
              <div className="error-message show" role="alert">{createError}</div>
            ) : null}
          </form>
        </Modal>
      )}

      {/* ── Rename folder modal ─────────────────────────────────────────── */}
      <PromptDialog
        isOpen={renameTarget !== null}
        title="Přejmenovat pobyt"
        label="Nový název pobytu"
        initialValue={renameTarget?.name ?? ''}
        maxLength={100}
        submitLabel="Přejmenovat"
        loading={renameFolder.isPending}
        errorMessage={renameError}
        onSubmit={handleRename}
        onCancel={() => {
          setRenameTarget(null)
          setRenameError(null)
        }}
      />

      <PromptDialog
        isOpen={deleteTarget !== null}
        title="Smazat pobyt"
        description={<>Smažeš celý pobyt včetně zápisků. Pro potvrzení napiš <strong>SMAZAT</strong>.</>}
        label="Potvrzovací text"
        placeholder="SMAZAT"
        submitLabel="Smazat"
        danger
        loading={deleteFolder.isPending}
        errorMessage={deleteError}
        canSubmit={(value) => value.trim() === 'SMAZAT'}
        onSubmit={() => void handleDelete()}
        onCancel={() => {
          setDeleteTarget(null)
          setDeleteError(null)
        }}
      />

      {/* ── Notebook modal ───────────────────────────────────────────────── */}
      {notebookState && currentFolder && (
        <NotebookModal
          dateObj={notebookState.dateObj}
          entry={notebookState.entry}
          folderId={currentFolder.id}
          allDates={allDates}
          onNavigate={handleNotebookNavigate}
          onClose={() => setNotebookState(null)}
          onSaved={handleNotebookSaved}
        />
      )}
    </div>
  )
}
