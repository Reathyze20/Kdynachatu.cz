/**
 * features/admin/AdminPage.tsx
 * Admin panel: user management, invites and cabin settings.
 */
import { Fragment, useState, useEffect, type SelectHTMLAttributes } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuth } from '@/context/AuthContext'
import {
  useAdminUsers,
  useCreateUser,
  useUpdateUser,
  useRemoveUserFromCabin,
  useDeleteUser,
  useDeleteUserReservations,
  useAdminInvites,
  useCreateInvite,
  useSendInviteEmail,
  useRevokeInvite,
} from './hooks/useAdmin'
import { type CabinUser, type Invite } from '@/api/admin'
import { showToast } from '@/lib/toast'
import { formatCount, formatDate } from '@/lib/format'
import { Modal } from '@/components/shared/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Card } from '@/components/shared/Card'
import { ListRow } from '@/components/shared/ListRow'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { AnimalAvatar } from '@/components/shared/AnimalAvatar'
import { FeatureErrorFallback } from '@/components/shared/FeatureErrorFallback'
import { CopyForWhatsAppButton } from '@/components/shared/CopyForWhatsAppButton'
import { getNetworkAwareActionMessage } from '@/lib/networkError'
import { ChevronDown, Mail, Pencil, ScrollText, Search, SearchX, SlidersHorizontal, Ticket, TicketPlus, UserPlus, Users } from 'lucide-react'
import { AdminCardHeading } from '@/features/admin/components/AdminCardHeading'
import { AdminSectionMenu } from '@/features/admin/components/AdminSectionMenu'
import { SystemStatsPanel } from '@/features/admin/components/SystemStatsPanel'
import { StagingFeedbackSection } from '@/features/admin/components/StagingFeedbackSection'
import { CabinSettingsPanel } from '@/features/settings/CabinSettingsPage'

type UserRoleFilter = 'all' | CabinUser['role']
type AdminWorkspace = 'members' | 'invites' | 'cabin'

const USER_ROLE_ORDER: Record<CabinUser['role'], number> = {
  admin: 0,
  user: 1,
  guest: 2,
}

function getRoleLabel(role: string): string {
  if (role === 'admin') return 'Admin'
  if (role === 'guest') return 'Host'
  return 'Člen'
}

function getRoleVariant(role: string): 'admin' | 'member' | 'guest' {
  if (role === 'admin') return 'admin'
  if (role === 'guest') return 'guest'
  return 'member'
}

function getRoleBadgeClass(role: string): string {
  return `admin-role-badge admin-role-badge--${getRoleVariant(role)}`
}

function getUserStatusMeta(user: Pick<CabinUser, 'isBanned' | 'isVerified' | 'isActive'>): {
  label: string
  className: string
} {
  if (user.isBanned) {
    return {
      label: 'Zablokovaný',
      className: 'admin-status-badge admin-status-badge--banned',
    }
  }

  if (!user.isVerified) {
    return {
      label: 'Čeká na ověření',
      className: 'admin-status-badge admin-status-badge--pending',
    }
  }

  return {
    label: user.isActive ? 'Aktivní' : 'Neaktivní',
    className: `admin-status-badge ${user.isActive ? 'admin-status-badge--active' : 'admin-status-badge--inactive'}`,
  }
}

function isInviteExpired(expiresAt: string): boolean {
  return new Date() > new Date(expiresAt)
}

function isInviteExhausted(invite: Pick<Invite, 'maxUses' | 'usedCount'>): boolean {
  return invite.maxUses !== null && invite.usedCount >= invite.maxUses
}

/** Vypršelá nebo vyčerpaná pozvánka patří do archivu, její odkaz už nefunguje. */
function isInviteArchived(invite: Pick<Invite, 'expiresAt' | 'maxUses' | 'usedCount'>): boolean {
  return isInviteExpired(invite.expiresAt) || isInviteExhausted(invite)
}

/** Texty potvrzení: aktivní pozvánka se ruší, archivní se odstraňuje. */
const REVOKE_COPY = {
  active: { title: 'Zrušit pozvánku?', confirmLabel: 'Zrušit pozvánku', cancelLabel: 'Nechat platit', verb: 'zrušit', toast: 'Pozvánka zrušena.' },
  archived: { title: 'Odstranit pozvánku z archivu?', confirmLabel: 'Odstranit', cancelLabel: 'Nechat', verb: 'odstranit', toast: 'Pozvánka odstraněna.' },
}

const getRevokeCopy = (invite: Invite) => REVOKE_COPY[isInviteArchived(invite) ? 'archived' : 'active']

function isInviteAccepted(invite: Pick<Invite, 'maxUses' | 'usedCount'>): boolean {
  return invite.usedCount > 0 && invite.maxUses !== null && invite.usedCount >= invite.maxUses
}

function getInviteStatus(invite: Invite): {
  label: string
  className: string
} {
  if (isInviteExpired(invite.expiresAt)) {
    return {
      label: 'Vypršela',
      className: 'admin-invite-status admin-invite-status--expired',
    }
  }

  if (isInviteAccepted(invite)) {
    return {
      label: 'Přijatá',
      className: 'admin-invite-status admin-invite-status--accepted',
    }
  }

  return {
    label: 'Aktivní',
    className: 'admin-invite-status admin-invite-status--active',
  }
}

function buildInviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`
}

function buildInviteShareText(invite: Invite): string {
  const roleLabel = getRoleLabel(invite.role).toLocaleLowerCase('cs-CZ')
  const usageHint = invite.maxUses === null
    ? 'Pozvánka je sdílená.'
    : invite.maxUses === 1
      ? 'Pozvánka je na jedno použití.'
      : `Pozvánku lze použít ${invite.maxUses}×.`

  return `Ahoj, zvu tě do chaty „${invite.cabinName}“ v aplikaci Kdy na chatu. Připoj se přes tento odkaz: ${buildInviteUrl(invite.token)} Role po přijetí: ${roleLabel}. Platnost do ${formatDate(invite.expiresAt)}. ${usageHint}`
}

function buildRevokeConfirmMessage(invite: Invite): string {
  const roleLabel = getRoleLabel(invite.role).toLocaleLowerCase('cs-CZ')
  if (isInviteArchived(invite)) {
    return `Pozvánka pro roli ${roleLabel} do chaty „${invite.cabinName}“ zmizí z archivu. Odkaz už nefunguje, vrátit to nejde.`
  }
  const author = invite.createdBy?.username ? `, autor: ${invite.createdBy.username}` : ''
  return `Pozvánka pro roli ${roleLabel} do chaty „${invite.cabinName}“ (platí do ${formatDate(invite.expiresAt)}${author}). Odkaz přestane fungovat a kdo ho už dostal, se přes něj nepřipojí.`
}

function isAdminWorkspace(value: string | null): value is AdminWorkspace {
  return value === 'members' || value === 'invites' || value === 'cabin'
}

function resolveAdminWorkspace(pathname: string, search: string, hash: string): AdminWorkspace {
  const panelFromQuery = new URLSearchParams(search).get('panel')
  if (isAdminWorkspace(panelFromQuery)) return panelFromQuery

  if (pathname === '/admin/invites') return 'invites'
  if (pathname === '/admin/cabin' || pathname === '/cabin-settings') return 'cabin'
  if (hash === '#admin-invites') return 'invites'
  if (hash === '#admin-cabin-settings') return 'cabin'

  return 'members'
}

function getAdminWorkspacePath(workspace: AdminWorkspace): string {
  if (workspace === 'invites') return '/admin/invites'
  if (workspace === 'cabin') return '/admin/cabin'
  return '/admin'
}

// ─── EditUserModal ────────────────────────────────────────────────────────────

type DangerAction = 'remove-from-cabin' | 'delete-reservations' | 'delete-user'

const DANGER_ACTIONS: Array<{
  id: DangerAction
  label: string
  hint: string
  selfHint?: string
  variant: 'ghost' | 'danger'
  className?: string
  testId: string
}> = [
  {
    id: 'remove-from-cabin',
    label: 'Odebrat z chaty',
    hint: 'Ztratí přístup k této chatě, účet i data mu zůstanou.',
    selfHint: 'Sebe z chaty odebrat nemůžeš.',
    variant: 'ghost',
    testId: 'edit-user-remove-from-cabin-button',
  },
  {
    id: 'delete-reservations',
    label: 'Smazat rezervace',
    hint: 'Smaže všechny jeho rezervace, účet zůstane.',
    variant: 'ghost',
    className: 'text-destructive',
    testId: 'edit-user-delete-reservations-button',
  },
  {
    id: 'delete-user',
    label: 'Smazat uživatele',
    hint: 'Smaže účet i všechno, co v chatě vytvořil.',
    selfHint: 'Vlastní účet smazat nemůžeš.',
    variant: 'danger',
    testId: 'edit-user-delete-user-button',
  },
]

/** Výběr role s viditelnou šipkou (globální `select` v forms.css má `appearance: none`). */
function RoleSelect({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`min-h-(--touch-target-min)! pr-10! text-base! ${className}`}>
        <option value="user">Člen</option>
        <option value="admin">Admin</option>
        <option value="guest">Host</option>
      </select>
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-(--text-muted)" />
    </div>
  )
}

interface EditUserModalProps {
  user: CabinUser
  onClose: () => void
  onDeleted: () => void
}

function EditUserModal({ user, onClose, onDeleted }: EditUserModalProps) {
  const { user: currentUser, isAdmin } = useAuth()
  const [role, setRole] = useState(user.role)
  const [password, setPassword] = useState('')
  const [confirmAction, setConfirmAction] = useState<DangerAction | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const updateUser = useUpdateUser()
  const removeUserFromCabin = useRemoveUserFromCabin()
  const deleteUser = useDeleteUser()
  const deleteReservations = useDeleteUserReservations()

  const isSelf = currentUser?.userId === user.id

  function handleSave() {
    setSaveError(null)
    updateUser.mutate(
      { id: user.id, data: { role, password: password || undefined } },
      {
        onSuccess: () => {
          setSaveError(null)
          showToast('Uživatel upraven.', 'success')
          onClose()
        },
        onError: (error) => {
          setSaveError(
            getNetworkAwareActionMessage(
              error,
              'Uživatele se nepodařilo upravit. Zkus to znovu.',
              'Spojení vypadlo dřív, než se změny uživatele stihly uložit. Zkus to znovu po obnovení připojení.',
            ),
          )
        },
      },
    )
  }

  function handleConfirmedAction() {
    if (confirmAction === 'delete-reservations') {
      setConfirmError(null)
      deleteReservations.mutate(user.id, {
        onSuccess: () => {
          setConfirmError(null)
          setConfirmAction(null)
          showToast('Rezervace smazány.', 'success')
        },
        onError: (error) => {
          setConfirmError(
            getNetworkAwareActionMessage(
              error,
              'Rezervace uživatele se nepodařilo smazat. Zkus to znovu.',
              'Spojení vypadlo dřív, než se rezervace stihly smazat. Zkus to znovu po obnovení připojení.',
            ),
          )
        },
      })
    } else if (confirmAction === 'remove-from-cabin') {
      setConfirmError(null)
      removeUserFromCabin.mutate(
        { id: user.id, deleteData: false },
        {
          onSuccess: () => {
            setConfirmError(null)
            setConfirmAction(null)
            showToast('Uživatel odebrán z chaty.', 'success')
            onDeleted()
            onClose()
          },
          onError: (error) => {
            setConfirmError(
              getNetworkAwareActionMessage(
                error,
                'Uživatele se nepodařilo odebrat z chaty. Zkus to znovu.',
                'Spojení vypadlo dřív, než se odebrání stihlo uložit. Zkus to znovu po obnovení připojení.',
              ),
            )
          },
        },
      )
    } else if (confirmAction === 'delete-user') {
      setConfirmError(null)
      deleteUser.mutate(user.id, {
        onSuccess: () => {
          setConfirmError(null)
          setConfirmAction(null)
          showToast('Uživatel smazán.', 'success')
          onDeleted()
          onClose()
        },
        onError: (error) => {
          setConfirmError(
            getNetworkAwareActionMessage(
              error,
              'Uživatele se nepodařilo smazat. Zkus to znovu.',
              'Spojení vypadlo dřív, než se uživatel stihl smazat. Zkus to znovu po obnovení připojení.',
            ),
          )
        },
      })
    }
  }

  // ── Edit view ──────────────────────────────────────────────────────────
  const isDeletingUser = confirmAction === 'delete-user'
  const isRemovingUserFromCabin = confirmAction === 'remove-from-cabin'
  const confirmLoading = isDeletingUser
    ? deleteUser.isPending
    : isRemovingUserFromCabin
      ? removeUserFromCabin.isPending
      : deleteReservations.isPending
  const statusMeta = getUserStatusMeta(user)

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        title="Upravit uživatele"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={updateUser.isPending}>
              Zrušit
            </Button>
            <Button type="button" onClick={handleSave} pending={updateUser.isPending} data-testid="edit-user-save-button">
              {updateUser.isPending ? 'Ukládám…' : 'Uložit'}
            </Button>
          </div>
        }
      >
          <p className="mb-4 text-meta text-(--text-muted)">
            {[
              statusMeta.label,
              formatCount(user.reservationCount, 'rezervace', 'rezervace', 'rezervací'),
              formatCount(user.photoCount, 'fotka', 'fotky', 'fotek'),
              formatCount(user.threadCount, 'vlákno', 'vlákna', 'vláken'),
            ].join(' · ')}
          </p>

          <div className="form-group">
            <label htmlFor="edit-username">Uživatelské jméno</label>
            <Input id="edit-username" type="text" value={user.username} disabled data-testid="edit-user-username-input" />
          </div>

          <div className="form-group">
            <label htmlFor="edit-role">Role</label>
            <RoleSelect
              id="edit-role"
              value={role}
              onChange={(e) => {
                if (saveError) setSaveError(null)
                setRole(e.target.value as CabinUser['role'])
              }}
              disabled={!isAdmin}
              data-testid="edit-user-role-select"
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-password">Nové heslo <span className="cs-optional">(nepovinné)</span></label>
            <Input
              id="edit-password"
              type="password"
              value={password}
              onChange={(e) => {
                if (saveError) setSaveError(null)
                setPassword(e.target.value)
              }}
              placeholder="Nech prázdné, pokud heslo neměníš"
              minLength={8}
              maxLength={100}
              autoComplete="new-password"
              data-testid="edit-user-password-input"
            />
          </div>
          {saveError ? (
            <div className="error-message show" role="alert" data-testid="edit-user-save-error">{saveError}</div>
          ) : null}

          {isAdmin && (
            <section aria-labelledby="edit-user-danger-zone" className="mt-6 border-t border-rule-soft pt-4">
              <h4 id="edit-user-danger-zone" className="text-eyebrow uppercase text-(--text-muted)">Nebezpečná zóna</h4>
              <ul className="mt-2 divide-y divide-rule-soft">
                {DANGER_ACTIONS.map((action) => {
                  const blocked = isSelf && action.selfHint !== undefined
                  return (
                    <li key={action.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                      <p className="text-label text-(--text-muted)">{blocked ? action.selfHint : action.hint}</p>
                      <Button
                        type="button"
                        variant={action.variant}
                        size="sm"
                        className={`shrink-0 self-start md:self-auto ${action.className ?? ''}`}
                        onClick={() => {
                          setConfirmError(null)
                          setConfirmAction(action.id)
                        }}
                        disabled={blocked}
                        data-testid={action.testId}
                      >
                        {action.label}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmAction !== null}
        title={isDeletingUser ? 'Smazat uživatele?' : isRemovingUserFromCabin ? 'Odebrat uživatele z chaty?' : 'Smazat rezervace?'}
        message={isDeletingUser
          ? `Smazat uživatele „${user.username}“? Zmizí i všechny jeho rezervace, nákupní seznamy, poznámky a záznamy v deníku. Nejde to vrátit.`
          : isRemovingUserFromCabin
            ? `Odebrat uživatele „${user.username}“ z této chaty? Ztratí do ní přístup, ale jeho účet i data zůstanou.`
            : `Smazat všechny rezervace uživatele „${user.username}“ (${formatCount(user.reservationCount, 'rezervace', 'rezervace', 'rezervací')})? Nejde to vrátit.`}
        confirmLabel={isDeletingUser ? 'Smazat uživatele' : isRemovingUserFromCabin ? 'Odebrat z chaty' : 'Smazat rezervace'}
        danger={!isRemovingUserFromCabin}
        loading={confirmLoading}
        errorMessage={confirmError}
        onConfirm={handleConfirmedAction}
        onCancel={() => {
          setConfirmAction(null)
          setConfirmError(null)
        }}
      />
    </>
  )
}

// ─── UserListSkeleton ─────────────────────────────────────────────────────────

/** Řádek meta textu, položky oddělené tečkou. Každá položka je vlastní prvek, aby ji šlo najít podle textu („1 rezervace“). */
function MetaLine({ items }: { items: string[] }) {
  return (
    <p className="flex flex-wrap gap-x-2 text-meta text-(--text-muted) wrap-anywhere">
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          <span>{item}</span>
        </Fragment>
      ))}
    </p>
  )
}

const MEMBER_LIST_CLASS = '-mx-4 divide-y divide-rule-soft border-t border-rule-soft md:-mx-6'

/** Obsah řádku pozvánky: role a stav, pod tím meta text. */
function InviteSummary({ invite, meta }: { invite: Invite; meta: string[] }) {
  const status = getInviteStatus(invite)
  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className={getRoleBadgeClass(invite.role)}>{getRoleLabel(invite.role)}</span>
        <span className={status.className}>{status.label}</span>
      </div>
      <MetaLine items={meta} />
    </div>
  )
}

function UserListSkeleton() {
  return (
    <ul className={MEMBER_LIST_CLASS} aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <ListRow as="li" key={i} action={<div className="skeleton h-12 w-24" />}>
          <div className="flex items-center gap-3">
            <div className="skeleton size-10 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-2"><div className="skeleton h-4 w-2/5" /><div className="skeleton h-4 w-3/5" /></div>
          </div>
        </ListRow>
      ))}
    </ul>
  )
}

function UserRow({ user, isSelf, onEdit }: { user: CabinUser; isSelf: boolean; onEdit: () => void }) {
  const statusMeta = getUserStatusMeta(user)
  const createdAt = formatDate(user.createdAt)

  return (
    <ListRow
      as="li"
      data-testid="admin-user-card"
      data-user-id={user.id}
      action={
        <Button variant="secondary" size="sm" onClick={onEdit} aria-label={`Upravit účet ${user.username}`} data-testid="admin-edit-user-button">
          <Pencil aria-hidden="true" />Upravit
        </Button>
      }
    >
      <div className="flex items-center gap-3">
        <div className="hidden shrink-0 md:block"><AnimalAvatar icon={user.animalIcon} username={user.username} color={user.avatarColor ?? undefined} size={40} /></div>
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold wrap-anywhere">{user.username}</span>
            {isSelf ? <span className="admin-user-self-badge">Tvůj účet</span> : null}
            <span className={getRoleBadgeClass(user.role)}>{getRoleLabel(user.role)}</span>
            <span className={statusMeta.className}>{statusMeta.label}</span>
          </div>
          <MetaLine items={[user.email || 'Bez e-mailu', ...(createdAt ? [`Vytvořen ${createdAt}`] : [])]} />
          <MetaLine
            items={[
              formatCount(user.reservationCount, 'rezervace', 'rezervace', 'rezervací'),
              formatCount(user.photoCount, 'fotka', 'fotky', 'fotek'),
              formatCount(user.threadCount, 'vlákno', 'vlákna', 'vláken'),
            ]}
          />
        </div>
      </div>
    </ListRow>
  )
}

interface InvitesSectionProps {
  invites: Invite[]
  isLoading: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
}

function InvitesSection({ invites, isLoading, isError, error, onRetry }: InvitesSectionProps) {
  const createInvite = useCreateInvite()
  const sendInviteEmail = useSendInviteEmail()
  const revokeInvite = useRevokeInvite()
  const [createError, setCreateError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [emailInvite, setEmailInvite] = useState<Invite | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<Invite | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [emailValue, setEmailValue] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCreateError(null)

    const form = e.currentTarget
    const fd = new FormData(form)
    const role = String(fd.get('invite-role') ?? 'user')
    const days = Number(fd.get('invite-days') ?? 7)
    const rawMaxUses = String(fd.get('invite-max-uses') ?? '').trim()
    const maxUses = rawMaxUses ? Number(rawMaxUses) : null

    createInvite.mutate(
      { role, expiresInDays: days, maxUses },
      {
        onSuccess: () => {
          setCreateError(null)
          showToast('Pozvánka vytvořena.', 'success')
          form.reset()
        },
        onError: (error) => {
          setCreateError(
            getNetworkAwareActionMessage(
              error,
              'Pozvánku se nepodařilo vytvořit. Zkus to znovu.',
              'Spojení vypadlo dřív, než se pozvánka stihla vytvořit. Zkus to znovu po obnovení připojení.',
            ),
          )
        },
      },
    )
  }

  function handleRevoke(invite: Invite) {
    const { verb, toast } = getRevokeCopy(invite)
    setActionError(null)
    setRevokeError(null)
    revokeInvite.mutate(invite.id, {
      onSuccess: () => {
        showToast(toast, 'success')
        setRevokeTarget(null)
      },
      onError: (error) => {
        setRevokeError(
          getNetworkAwareActionMessage(
            error,
            `Pozvánku se nepodařilo ${verb}. Zkus to znovu.`,
            `Spojení vypadlo dřív, než se pozvánka stihla ${verb}. Zkus to znovu po obnovení připojení.`,
          ),
        )
      },
    })
  }

  function handleOpenEmailModal(invite: Invite) {
    setActionError(null)
    setEmailError(null)
    setEmailValue('')
    setEmailInvite(invite)
  }

  function handleCloseEmailModal() {
    if (sendInviteEmail.isPending) return
    setEmailInvite(null)
    setEmailValue('')
    setEmailError(null)
  }

  function handleSendInviteEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!emailInvite) return

    const trimmedEmail = emailValue.trim()
    if (!trimmedEmail) {
      setEmailError('Zadej e-mail, kam se má pozvánka poslat.')
      return
    }

    setEmailError(null)
    setActionError(null)
    sendInviteEmail.mutate(
      { id: emailInvite.id, email: trimmedEmail },
      {
        onSuccess: (response) => {
          setEmailError(null)
          showToast(response.message || 'Pozvánka odeslána e-mailem.', 'success')
          handleCloseEmailModal()
        },
        onError: (error) => {
          setEmailError(
            getNetworkAwareActionMessage(
              error,
              'Pozvánku se nepodařilo odeslat e-mailem. Zkus to znovu.',
              'Spojení vypadlo dřív, než se pozvánka stihla odeslat. Zkus to znovu po obnovení připojení.',
            ),
          )
        },
      },
    )
  }

  const activeInvites = invites.filter((invite) => !isInviteArchived(invite))
  const inactiveInvites = invites.filter(isInviteArchived)
  const revokeCopy = revokeTarget ? getRevokeCopy(revokeTarget) : REVOKE_COPY.active

  return (
    <Card as="section" className="space-y-4" id="admin-invites" data-testid="admin-invites-section">
      <AdminCardHeading
        eyebrow="Pozvánky"
        title="Odkazy pro nové členy"
        meta={formatCount(activeInvites.length, 'aktivní', 'aktivní', 'aktivních')}
        description="Rychlé vstupy pro rodinu, brigádníka nebo hosta. Aktivní pozvánky drž na očích, staré nech v archivu."
      />

      <form
        className="grid gap-x-3 md:grid-cols-3 md:items-end [&_.form-group]:mb-3"
        onSubmit={handleCreate}
        onChange={() => {
          if (createError) setCreateError(null)
        }}
        data-testid="invite-create-form"
      >
        <div className="form-group">
          <label htmlFor="invite-role">Role</label>
          <RoleSelect id="invite-role" name="invite-role" data-testid="invite-role-select" />
        </div>
        <div className="form-group">
          <label htmlFor="invite-days">Platnost (dní)</label>
          <Input id="invite-days" name="invite-days" type="number" min={1} max={365} defaultValue={7} data-testid="invite-days-input" />
        </div>
        <div className="form-group">
          <label htmlFor="invite-max-uses">Počet použití</label>
          <Input id="invite-max-uses" name="invite-max-uses" type="number" min={1} max={100} defaultValue={1} placeholder="1" data-testid="invite-max-uses-input" />
        </div>
        <Button type="submit" className="md:col-span-3" pending={createInvite.isPending} data-testid="invite-create-submit">
          {createInvite.isPending ? null : <TicketPlus aria-hidden="true" />}
          {createInvite.isPending ? 'Vytvářím…' : 'Vytvořit pozvánku'}
        </Button>
      </form>
      <p className="text-label text-(--text-muted)">Pro rodinu je nejpraktičtější jednorázová pozvánka. Pole počet použití můžeš smazat, pokud chceš sdílený odkaz.</p>
      {createError ? (
        <div className="error-message show admin-section-error" role="alert">{createError}</div>
      ) : null}

      {isLoading ? (
        <ul className={MEMBER_LIST_CLASS} aria-busy="true" aria-label="Načítám pozvánky…">
          {[0, 1].map((i) => (
            <ListRow as="li" key={i}><div className="grid gap-2"><div className="skeleton h-4 w-2/5" /><div className="skeleton h-4 w-3/5" /></div></ListRow>
          ))}
        </ul>
      ) : isError ? (
        <FeatureErrorFallback
          bare
          error={error instanceof Error ? error : new Error('Nepodařilo se načíst pozvánky')}
          resetErrorBoundary={onRetry}
          title="Pozvánky se nepodařilo načíst"
        />
      ) : activeInvites.length === 0 ? (
        <EmptyState icon={Ticket} message="Zatím tu nejsou žádné aktivní pozvánky." />
      ) : (
        <ul className={MEMBER_LIST_CLASS} data-testid="invite-active-list">
          {activeInvites.map((inv) => (
            <ListRow as="li" key={inv.id} data-testid="invite-card" data-invite-id={inv.id}>
              <div className="grid gap-2">
                <InviteSummary
                  invite={inv}
                  meta={[
                    inv.maxUses !== null
                      ? isInviteAccepted(inv)
                        ? `Přijato ${inv.usedCount}/${inv.maxUses}`
                        : `${inv.usedCount}/${inv.maxUses} použití`
                      : inv.usedCount > 0
                        ? `Použito ${inv.usedCount}×`
                        : 'Sdílená pozvánka',
                    `Platí do ${formatDate(inv.expiresAt)}`,
                    `Chata ${inv.cabinName}`,
                    ...(inv.createdBy?.username ? [`Vytvořil ${inv.createdBy.username}`] : []),
                  ]}
                />
                <div className="grid gap-2 md:flex md:flex-wrap">
                  <CopyForWhatsAppButton
                    text={buildInviteShareText(inv)}
                    onCopied={() => setActionError(null)}
                    onError={() => setActionError('Prohlížeč nepovolil zkopírování textu pozvánky. Zkus akci zopakovat nebo zprávu poslat e-mailem.')}
                    testId="invite-copy-message-button"
                  />
                  <Button variant="secondary" size="sm" onClick={() => handleOpenEmailModal(inv)} data-testid="invite-email-button">
                    <Mail aria-hidden="true" />E-mail
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setRevokeTarget(inv)}
                    disabled={revokeInvite.isPending}
                    data-testid="invite-revoke-button"
                  >
                    Zrušit
                  </Button>
                </div>
              </div>
            </ListRow>
          ))}
        </ul>
      )}
      {actionError ? (
        <div className="error-message show admin-section-error" role="alert">{actionError}</div>
      ) : null}

      {!isError && inactiveInvites.length > 0 && (
        <details className="admin-details">
          <summary>
            <span>Archiv neaktivních pozvánek</span>
            <span className="admin-details-count">{inactiveInvites.length}</span>
          </summary>
          <ul className={MEMBER_LIST_CLASS} data-testid="invite-archive-list">
            {inactiveInvites.map((inv) => (
              <ListRow
                as="li"
                key={inv.id}
                action={
                  <Button variant="secondary" size="sm" className="text-destructive" onClick={() => setRevokeTarget(inv)} disabled={revokeInvite.isPending} data-testid="invite-archive-delete-button">
                    Odstranit
                  </Button>
                }
              >
                <InviteSummary
                  invite={inv}
                  meta={[
                    isInviteAccepted(inv) ? `Přijato ${inv.usedCount}${inv.maxUses ? `/${inv.maxUses}` : '×'}` : `${inv.usedCount} použití`,
                    `Platnost do ${formatDate(inv.expiresAt)}`,
                    `Chata ${inv.cabinName}`,
                  ]}
                />
              </ListRow>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        isOpen={revokeTarget !== null}
        title={revokeCopy.title}
        message={revokeTarget ? buildRevokeConfirmMessage(revokeTarget) : ''}
        confirmLabel={revokeCopy.confirmLabel}
        cancelLabel={revokeCopy.cancelLabel}
        danger
        loading={revokeInvite.isPending}
        errorMessage={revokeError}
        onConfirm={() => {
          if (revokeTarget) handleRevoke(revokeTarget)
        }}
        onCancel={() => {
          setRevokeTarget(null)
          setRevokeError(null)
        }}
      />

      <Modal
        isOpen={emailInvite !== null}
        onClose={handleCloseEmailModal}
        title="Odeslat pozvánku e-mailem"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="secondary" onClick={handleCloseEmailModal} disabled={sendInviteEmail.isPending}>
              Zrušit
            </Button>
            <Button type="submit" form="invite-email-form" pending={sendInviteEmail.isPending}>
              {sendInviteEmail.isPending ? 'Odesílám…' : 'Odeslat pozvánku'}
            </Button>
          </div>
        }
      >
        {emailInvite ? (
          <form id="invite-email-form" className="admin-compact-form" onSubmit={handleSendInviteEmail}>
            <p className="admin-form-note admin-invite-modal-note">
              Pozvánka do chaty <strong>{emailInvite.cabinName}</strong> se odešle jako role <strong>{getRoleLabel(emailInvite.role).toLocaleLowerCase('cs-CZ')}</strong>.
            </p>
            <div className="form-group">
              <label htmlFor="invite-email-target">E-mail příjemce</label>
              <Input
                id="invite-email-target"
                type="email"
                value={emailValue}
                onChange={(event) => {
                  setEmailValue(event.target.value)
                  if (emailError) setEmailError(null)
                }}
                placeholder="např. rodina@example.com"
                autoFocus
                maxLength={255}
              />
            </div>
            <div className="admin-invite-share-preview">
              <span>Krátký text pro zprávu</span>
              <p>{buildInviteShareText(emailInvite)}</p>
            </div>
            {emailError ? <div className="error-message show admin-section-error" role="alert">{emailError}</div> : null}
          </form>
        ) : null}
      </Modal>
    </Card>
  )
}

// ─── AdminPage ────────────────────────────────────────────────────────────────

export function AdminPage() {
  useDocumentTitle('Administrativa');
  const location = useLocation()
  const navigate = useNavigate()
  const { isAdmin, user: currentUser } = useAuth()

  const {
    data: users = [],
    isLoading: usersLoading,
    isError: usersFailed,
    error: usersError,
    refetch: refetchUsers,
  } = useAdminUsers()
  const {
    data: invites = [],
    isLoading: invitesLoading,
    isError: invitesFailed,
    error: invitesError,
    refetch: refetchInvites,
  } = useAdminInvites()
  const createUser = useCreateUser()

  const [editUser, setEditUser] = useState<CabinUser | null>(null)
  const [createUserError, setCreateUserError] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>('all')

  const sortedUsers = [...users].sort((left, right) => {
    const roleDiff = USER_ROLE_ORDER[left.role] - USER_ROLE_ORDER[right.role]
    if (roleDiff !== 0) return roleDiff

    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1

    return left.username.localeCompare(right.username, 'cs-CZ')
  })

  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase('cs-CZ')
  const filteredUsers = sortedUsers.filter((user) => {
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    const matchesText = !normalizedSearchTerm
      || user.username.toLocaleLowerCase('cs-CZ').includes(normalizedSearchTerm)
      || user.email?.toLocaleLowerCase('cs-CZ').includes(normalizedSearchTerm)

    return matchesRole && matchesText
  })

  const adminCount = users.filter((user) => user.role === 'admin').length
  const memberCount = users.filter((user) => user.role === 'user').length
  const guestCount = users.filter((user) => user.role === 'guest').length
  const activeInvitesCount = invites.filter((invite) => !isInviteArchived(invite)).length
  const archivedInvitesCount = invites.length - activeInvitesCount
  const localAccountCount = users.filter((user) => !user.email).length
  const hasUserFilters = normalizedSearchTerm.length > 0 || roleFilter !== 'all'

  const filterOptions: Array<{ value: UserRoleFilter; label: string; count: number }> = [
    { value: 'all', label: 'Všichni', count: users.length },
    { value: 'admin', label: 'Admini', count: adminCount },
    { value: 'user', label: 'Členové', count: memberCount },
    { value: 'guest', label: 'Hosté', count: guestCount },
  ]
  const activeWorkspace = resolveAdminWorkspace(location.pathname, location.search, location.hash)

  const workspaceSummary: Record<AdminWorkspace, { title: string; lead: string }> = {
    members: {
      title: 'Členové a jejich role',
      lead: 'Přidej člena bez e-mailu, uprav role a rychle zkontroluj, kdo má do chaty skutečně přístup.',
    },
    invites: {
      title: 'Pozvánky, sdílené odkazy a nové vstupy',
      lead: 'Když potřebuješ přidat nového člověka, řeš to tady: role, platnost, kopírování zprávy i odeslání e-mailem.',
    },
    cabin: {
      title: 'Společné nastavení chaty v jednom panelu',
      lead: 'Všechno, co mění chování celé aplikace pro rodinu: údaje chaty, pravidla, checklist a zapnuté moduly.',
    },
  }

  function resetUserFilters() {
    setSearchTerm('')
    setRoleFilter('all')
  }

  function openWorkspace(workspace: AdminWorkspace, sectionId?: string) {
    navigate(`${getAdminWorkspacePath(workspace)}${sectionId ? `#${sectionId}` : ''}`)
  }

  function openDiagnostics() {
    navigate('/admin/diagnostics#system-logs')
  }

  useEffect(() => {
    const legacyPanel = new URLSearchParams(location.search).get('panel')
    if (!legacyPanel) return

    if (legacyPanel === 'debug') {
      navigate(`/admin/diagnostics${location.hash || ''}`, { replace: true })
      return
    }

    if (legacyPanel === 'members' || legacyPanel === 'invites' || legacyPanel === 'cabin') {
      navigate(`${getAdminWorkspacePath(legacyPanel)}${location.hash || ''}`, { replace: true })
    }
  }, [location.hash, location.search, navigate])

  useEffect(() => {
    if (!location.hash) return

    const sectionId = location.hash.slice(1)
    const timeoutId = window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)

    return () => window.clearTimeout(timeoutId)
  }, [location.hash, usersLoading, invitesLoading])

  // Guard
  if (!isAdmin) {
    return (
      <div className="main-content-admin" data-testid="admin-page" data-admin-state="denied">
        <Card>
          <PageHeader title="Přístup odepřen" subtitle="Nemáš administrátorská oprávnění pro správu účtů, pozvánek ani systémového přehledu." />
        </Card>
      </div>
    )
  }

  // ── Add user handler ────────────────────────────────────────────────────

  function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const body = {
      username: String(fd.get('username') ?? '').trim(),
      password: String(fd.get('password') ?? ''),
      role: String(fd.get('role') ?? 'user'),
    }
    // Prázdné heslo zastaví už `required`, jméno ze samých mezer až tady
    if (!body.username) {
      setUsernameError('Vyplň uživatelské jméno.')
      return
    }
    setCreateUserError(null)
    createUser.mutate(body, {
      onSuccess: () => {
        setCreateUserError(null)
        showToast('Uživatel vytvořen.', 'success')
        form.reset()
      },
      onError: (error) => {
        setCreateUserError(
          getNetworkAwareActionMessage(
            error,
            'Uživatele se nepodařilo vytvořit. Zkus to znovu.',
            'Spojení vypadlo dřív, než se uživatel stihl vytvořit. Zkus to znovu po obnovení připojení.',
          ),
        )
      },
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="main-content-admin" data-testid="admin-page" data-admin-state="ready" data-admin-workspace={activeWorkspace}>
      <Card as="section" className="grid gap-4 md:gap-6">
        <PageHeader
          title={workspaceSummary[activeWorkspace].title}
          subtitle={workspaceSummary[activeWorkspace].lead}
          primaryAction={{ label: 'Přidat člena', icon: UserPlus, onClick: () => openWorkspace('members', 'admin-create-user') }}
          secondaryActions={[{ label: 'Otevřít diagnostiku', icon: ScrollText, onSelect: openDiagnostics }]}
        />
        <AdminSectionMenu active={activeWorkspace} />
      </Card>

      {/* Jen staging (#390); na stagingu je Správa hlavně kvůli ní, proto nahoře ve výchozím panelu */}
      {activeWorkspace === 'members' ? <StagingFeedbackSection /> : null}

      {activeWorkspace === 'members' ? (
        <div className="admin-layout-grid">
          <Card as="section" className="space-y-4" id="admin-users" data-testid="admin-users-section">
            <AdminCardHeading
              eyebrow="Účty a role"
              title="Přehled uživatelů"
              description="Hledej podle jména nebo e-mailu, filtruj role a otevři detail účtu pro změnu oprávnění, hesla nebo mazání rezervací."
            />

            <div className="relative">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--text-muted)" />
              <Input
                id="admin-user-search"
                type="search"
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Hledat člena"
                aria-label="Hledat člena"
                data-testid="admin-user-search-input"
              />
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrovat účty podle role" data-testid="admin-role-filters">
              {filterOptions.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={roleFilter === option.value ? 'primary' : 'secondary'}
                  aria-pressed={roleFilter === option.value}
                  onClick={() => setRoleFilter(option.value)}
                  data-testid="admin-role-filter-button"
                  data-role-filter={option.value}
                >
                  {option.label} <span className="tabular-nums">{option.count}</span>
                </Button>
              ))}
            </div>

            {usersLoading ? (
              <UserListSkeleton />
            ) : usersFailed ? (
              <FeatureErrorFallback
                bare
                error={usersError instanceof Error ? usersError : new Error('Nepodařilo se načíst uživatele')}
                resetErrorBoundary={() => {
                  void refetchUsers()
                }}
                title="Uživatele se nepodařilo načíst"
              />
            ) : filteredUsers.length === 0 ? (
              <EmptyState
                icon={users.length === 0 ? Users : SearchX}
                message={users.length === 0 ? 'Zatím tu nikdo není.' : 'Tomu filtru nikdo neodpovídá.'}
                action={users.length === 0
                  ? { label: 'Přidat člena', icon: UserPlus, onClick: () => openWorkspace('members', 'admin-create-user') }
                  : { label: 'Vyčistit filtr', onClick: resetUserFilters }}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-meta text-(--text-muted)">
                  <span>
                    {hasUserFilters
                      ? `Zobrazuji ${formatCount(filteredUsers.length, 'účet', 'účty', 'účtů')} podle aktuálního filtru.`
                      : 'Účty jsou seřazené podle role, aktivity a názvu.'}
                  </span>
                  {hasUserFilters ? (
                    <Button variant="ghost" size="sm" onClick={resetUserFilters}>
                      Vyčistit filtr
                    </Button>
                  ) : null}
                </div>

                <ul id="users-list" className={MEMBER_LIST_CLASS} data-testid="admin-users-list">
                  {filteredUsers.map((user) => (
                    <UserRow key={user.id} user={user} isSelf={currentUser?.userId === user.id} onEdit={() => setEditUser(user)} />
                  ))}
                </ul>
              </>
            )}
          </Card>

          <aside className="admin-sidebar-stack">
            <Card as="section" className="space-y-4" id="admin-create-user" data-testid="admin-create-user-section">
              <AdminCardHeading
                eyebrow="Nový přístup"
                title="Přidat člena bez e-mailu"
                description="Použij pro členy rodiny, kteří se přihlašují přímo jménem a heslem bez pozvánky e-mailem."
              />

              <form
                id="add-user-form"
                className="admin-compact-form admin-user-create-form"
                onSubmit={handleCreateUser}
                onChange={() => {
                  if (createUserError) setCreateUserError(null)
                  if (usernameError) setUsernameError(null)
                }}
                data-testid="admin-create-user-form"
              >
                <div className="form-group">
                  <label htmlFor="new-username">Uživatelské jméno</label>
                  <Input id="new-username" name="username" type="text" required minLength={3} maxLength={50} invalid={Boolean(usernameError)} aria-describedby={usernameError ? 'new-username-error' : undefined} data-testid="admin-create-username-input" />
                  {usernameError ? <p id="new-username-error" className="error-message show" role="alert">{usernameError}</p> : null}
                </div>
                <div className="form-group">
                  <label htmlFor="new-password">Heslo</label>
                  <Input id="new-password" name="password" type="password" required minLength={8} maxLength={100} autoComplete="new-password" data-testid="admin-create-password-input" />
                </div>
                <div className="form-group">
                  <label htmlFor="new-role">Role</label>
                  <RoleSelect id="new-role" name="role" data-testid="admin-create-role-select" />
                </div>
                <Button type="submit" pending={createUser.isPending} data-testid="admin-create-submit-button">
                  {createUser.isPending ? null : <UserPlus aria-hidden="true" />}
                  {createUser.isPending ? 'Přidávám…' : 'Přidat uživatele'}
                </Button>
              </form>

              <p className="text-label text-(--text-muted)">
                Admin má plný přístup. Host uvidí obsah, ale bez běžného vytváření a mazání. Účet můžeš později upravit v detailu uživatele.
              </p>

              {createUserError ? (
                <div className="error-message show admin-section-error" role="alert" data-testid="admin-create-user-error">{createUserError}</div>
              ) : null}
            </Card>

            <Card as="section" id="system-info" data-testid="admin-system-stats-section">
              <AdminCardHeading
                eyebrow="Přehled aplikace"
                title="Statistiky systému"
                description="Kolik je v aplikaci lidí, rezervací, fotek a zpráv. Hodí se při kontrole aktivity nebo před větší údržbou."
              />
              <SystemStatsPanel />
            </Card>
          </aside>
        </div>
      ) : null}

      {activeWorkspace === 'invites' ? (
        <div className="admin-layout-grid">
          <div className="admin-panel-stack">
            <InvitesSection
              invites={invites}
              isLoading={invitesLoading}
              isError={invitesFailed}
              error={invitesError}
              onRetry={() => {
                void refetchInvites()
              }}
            />
          </div>

          <aside className="admin-sidebar-stack">
            <Card as="section" className="space-y-4" data-testid="admin-invite-guidance-section">
              <AdminCardHeading
                eyebrow="Rychlé rozhodnutí"
                title="Jak člena přidat"
                description="Pozvánka je nejlepší pro většinu rodiny. Účet bez e-mailu použij jen tam, kde se člověk nechce registrovat přes odkaz."
              />

              <div className="grid gap-2">
                <Button variant="secondary" onClick={() => openWorkspace('members', 'admin-create-user')}>
                  <UserPlus aria-hidden="true" />Přidat člena bez e-mailu
                </Button>
                <Button variant="secondary" onClick={() => openWorkspace('cabin')}>
                  <SlidersHorizontal aria-hidden="true" />Zkontrolovat moduly chaty
                </Button>
                <Button variant="secondary" onClick={openDiagnostics}>
                  <ScrollText aria-hidden="true" />Otevřít diagnostiku
                </Button>
              </div>

              <dl className="grid gap-2">
                {[
                  { label: 'Aktivní pozvánky', value: invitesLoading || invitesFailed ? '—' : activeInvitesCount },
                  { label: 'Archiv', value: invitesLoading || invitesFailed ? '—' : archivedInvitesCount },
                  { label: 'Členové bez e-mailu', value: usersLoading || usersFailed ? '—' : localAccountCount },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 rounded-xl bg-inset px-3 py-2">
                    <dt className="text-label text-(--text-muted)">{label}</dt>
                    <dd className="text-card-title tabular-nums text-(--text-main)">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card as="section" id="system-info" data-testid="admin-invite-system-stats-section">
              <AdminCardHeading eyebrow="Přehled aplikace" title="Statistiky systému" description="Kolik je v aplikaci lidí a jak se opravdu používá." />
              <SystemStatsPanel />
            </Card>
          </aside>
        </div>
      ) : null}

      {activeWorkspace === 'cabin' ? (
        // Bez vlastní karty: CabinSettingsPanel je karta sám, karta v kartě by byla navíc (DESIGN.md §6)
        <section className="admin-settings-shell" id="admin-cabin-settings" data-testid="admin-cabin-settings-section">
          <CabinSettingsPanel
            title="Společné nastavení chaty"
            subtitle="Všechno sdílené na jednom místě: údaje chaty, pravidla, odjezdový checklist i zapnuté moduly."
          />
        </section>
      ) : null}

      {/* Edit user modal */}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onDeleted={() => setEditUser(null)}
        />
      )}
    </div>
  )
}
