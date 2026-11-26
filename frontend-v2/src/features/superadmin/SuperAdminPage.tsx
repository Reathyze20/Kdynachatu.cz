import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Inbox, Search, SearchX, Shield, UserPlus, Users } from 'lucide-react'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuth } from '@/context/AuthContext'
import { showToast } from '@/lib/toast'
import { formatCount, formatDate, pluralize } from '@/lib/format'
import { memberInitial } from '@/lib/memberPalette'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/shared/Card'
import { ListRow } from '@/components/shared/ListRow'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { FeatureErrorFallback } from '@/components/shared/FeatureErrorFallback'
import { LogsPanel } from '@/components/shared/LogsPanel'
import { PageHeader } from '@/components/shared/PageHeader'
import { AdminCardHeading } from '@/features/admin/components/AdminCardHeading'
import { superadminApi, type SuperadminCreateUserResponse, type SystemUser } from '@/api/superadmin'
import {
  useSuperadminCreateUser,
  useSuperadminToggleBan,
  useSuperadminUsers,
} from './hooks/useSuperadmin'
import { getNetworkAwareActionMessage } from '@/lib/networkError'


type RoleFilter = 'all' | SystemUser['role']
type StatusFilter = 'all' | 'active' | 'pending' | 'banned' | 'superadmin'

function getRoleLabel(role: SystemUser['role']): string {
  if (role === 'admin') return 'Admin'
  if (role === 'guest') return 'Host'
  return 'Člen'
}

/** Vnořená plocha v kartě (údaj k předání), její popisek a pole s tajným údajem. */
const TILE_CLASS = 'grid content-start gap-1 rounded-xl bg-inset p-3 md:p-4'
const EYEBROW_CLASS = 'text-eyebrow uppercase text-(--text-muted)'
const CODE_CLASS = 'block whitespace-pre-wrap rounded-lg bg-sheet p-3 text-label text-(--text-main) wrap-anywhere'
/** Seznam účtů na celou šířku karty, oddělovače mezi řádky `ListRow` (stejně jako Správa členů). */
const USER_LIST_CLASS = '-mx-4 divide-y divide-rule-soft border-t border-rule-soft md:-mx-6'

function getStatusMeta(user: SystemUser): { label: string; className: string } {
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
    label: 'Aktivní',
    className: 'admin-status-badge admin-status-badge--active',
  }
}

function UserListSkeleton() {
  return (
    <ul className={USER_LIST_CLASS} aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <ListRow as="li" key={index} action={<div className="skeleton h-12 w-28 rounded-xl" />}>
          <div className="flex items-center gap-3">
            <div className="skeleton hidden size-10 shrink-0 rounded-full md:block" />
            <div className="grid flex-1 gap-2"><div className="skeleton h-4 w-2/5" /><div className="skeleton h-4 w-3/5" /></div>
          </div>
        </ListRow>
      ))}
    </ul>
  )
}

interface FilterOption<T extends string> {
  value: T
  label: string
  count: number
}

/** Řada přepínačů filtru: vybraný je primární, ostatní sekundární, stav nese `aria-pressed`. */
function FilterButtons<T extends string>({ label, options, value, onChange, testId }: {
  label: string
  options: Array<FilterOption<T>>
  value: T
  onChange: (value: T) => void
  testId: string
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label} data-testid={testId}>
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={value === option.value ? 'primary' : 'secondary'}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label} <span className="tabular-nums">{option.count}</span>
        </Button>
      ))}
    </div>
  )
}

export function SuperAdminPage() {
  useDocumentTitle('Backoffice')

  const { isSuperAdmin, user: currentUser } = useAuth()
  const {
    data: users = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useSuperadminUsers()
  const createUser = useSuperadminCreateUser()
  const toggleBan = useSuperadminToggleBan()

  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [createError, setCreateError] = useState<string | null>(null)
  const [banError, setBanError] = useState<string | null>(null)
  const [pendingBanUser, setPendingBanUser] = useState<SystemUser | null>(null)
  const [lastCreatedUser, setLastCreatedUser] = useState<SuperadminCreateUserResponse | null>(null)
  const [copiedSecret, setCopiedSecret] = useState<'password' | 'token' | null>(null)
  const [showSecrets, setShowSecrets] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
    }
  }, [])

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('cs-CZ')
  const sortedUsers = [...users].sort((left, right) => {
    if (left.isSuperAdmin !== right.isSuperAdmin) return left.isSuperAdmin ? -1 : 1
    if (left.isBanned !== right.isBanned) return left.isBanned ? 1 : -1
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })

  const filteredUsers = sortedUsers.filter((user) => {
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    const matchesStatus =
      statusFilter === 'all'
      || (statusFilter === 'active' && user.isActive)
      || (statusFilter === 'pending' && !user.isVerified && !user.isBanned)
      || (statusFilter === 'banned' && user.isBanned)
      || (statusFilter === 'superadmin' && user.isSuperAdmin)
    const matchesText =
      !normalizedSearch
      || user.username.toLocaleLowerCase('cs-CZ').includes(normalizedSearch)
      || user.email?.toLocaleLowerCase('cs-CZ').includes(normalizedSearch)

    return matchesRole && matchesStatus && matchesText
  })

  const totalUsers = users.length
  const superAdminCount = users.filter((user) => user.isSuperAdmin).length
  const bannedCount = users.filter((user) => user.isBanned).length
  const pendingCount = users.filter((user) => !user.isVerified && !user.isBanned).length
  const activeCount = users.filter((user) => user.isActive).length
  const hasFilters = normalizedSearch.length > 0 || roleFilter !== 'all' || statusFilter !== 'all'
  const hasFallbackSecrets = Boolean(lastCreatedUser?.tempPassword && lastCreatedUser?.verificationToken)

  const roleFilters: Array<FilterOption<RoleFilter>> = [
    { value: 'all', label: 'Všechny role', count: users.length },
    { value: 'admin', label: 'Admini', count: users.filter((user) => user.role === 'admin').length },
    { value: 'user', label: 'Členové', count: users.filter((user) => user.role === 'user').length },
    { value: 'guest', label: 'Hosté', count: users.filter((user) => user.role === 'guest').length },
  ]

  const statusFilters: Array<FilterOption<StatusFilter>> = [
    { value: 'all', label: 'Všechny stavy', count: users.length },
    { value: 'active', label: 'Aktivní', count: activeCount },
    { value: 'pending', label: 'Čekají', count: pendingCount },
    { value: 'banned', label: 'Zablokovaní', count: bannedCount },
    { value: 'superadmin', label: 'Super Admini', count: superAdminCount },
  ]

  const overviewStats = [
    { label: 'Účty v systému', value: totalUsers, meta: 'Celkový počet registrovaných účtů napříč všemi chatami.' },
    {
      label: 'Aktivní účty',
      value: activeCount,
      meta: pendingCount > 0
        ? `${formatCount(pendingCount, 'účet', 'účty', 'účtů')} ještě ${pluralize(pendingCount, 'čeká', 'čekají', 'čeká')} na dokončení aktivace.`
        : 'Žádný účet momentálně nečeká na ověření.',
    },
    { label: 'Zablokované účty', value: bannedCount, meta: 'Okamžitý přehled účtů, které mají zablokovaný přístup.' },
    { label: 'Super Admini', value: superAdminCount, meta: 'Počet globálních správců s přístupem do backoffice.' },
  ]

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function resetFilters() {
    setSearchTerm('')
    setRoleFilter('all')
    setStatusFilter('all')
  }

  function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = {
      username: String(formData.get('username') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      role: String(formData.get('role') ?? 'user') as SystemUser['role'],
    }

    if (!payload.username || !payload.email) {
      showToast('Vyplň jméno i e-mail.', 'error')
      return
    }

    setCreateError(null)
    createUser.mutate(payload, {
      onSuccess: (response) => {
        setCreateError(null)
        setLastCreatedUser(response)
        setShowSecrets(false)
        setCopiedSecret(null)
        form.reset()
        showToast(response.message, response.verificationEmailSent ? 'success' : 'info')
      },
      onError: (mutationError) => {
        setCreateError(
          getNetworkAwareActionMessage(
            mutationError,
            'Účet se nepodařilo vytvořit. Zkus to znovu.',
            'Spojení vypadlo dřív, než se účet stihl vytvořit. Zkus to znovu po obnovení připojení.',
          ),
        )
      },
    })
  }

  function handleConfirmBan() {
    if (!pendingBanUser) return

    setBanError(null)
    toggleBan.mutate(pendingBanUser.id, {
      onSuccess: (response) => {
        setBanError(null)
        showToast(response.message, 'success')
        setPendingBanUser(null)
      },
      onError: (mutationError) => {
        setBanError(
          getNetworkAwareActionMessage(
            mutationError,
            'Stav účtu se nepodařilo změnit. Zkus to znovu.',
            'Spojení vypadlo dřív, než se změna stihla uložit. Zkus to znovu po obnovení připojení.',
          ),
        )
      },
    })
  }

  async function copySecret(kind: 'password' | 'token', value: string) {
    try {
      await navigator.clipboard.writeText(value)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      setCopiedSecret(kind)
      showToast('Hodnota zkopírována.', 'success')
      copyTimerRef.current = setTimeout(() => setCopiedSecret(null), 1800)
    } catch {
      showToast('Prohlížeč nepovolil kopírování.', 'error')
    }
  }

  function revealSecretsTemporarily() {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
    setShowSecrets(true)
    revealTimerRef.current = setTimeout(() => {
      setShowSecrets(false)
    }, 20_000)
  }

  function hideSecrets() {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
    setShowSecrets(false)
  }

  if (!isSuperAdmin) {
    return (
      <div className="main-content-admin" data-testid="superadmin-page" data-superadmin-state="denied">
        <Card>
          <PageHeader title="Přístup odepřen" subtitle="Tato sekce je vyhrazená pouze pro Super Adminy." />
        </Card>
      </div>
    )
  }

  return (
    <div className="main-content-admin" data-testid="superadmin-page" data-superadmin-state="ready">
      <Card as="section" className="grid gap-4 md:gap-6">
        <PageHeader
          title="Globální dohled nad účty a provozem"
          subtitle="Tady řešíš systémové účty napříč celou aplikací, blokace, ruční zakládání uživatelů a provozní logy. Rozhraní je záměrně stejné jako cabin admin, ale s větším důrazem na kontrolu a bezpečnost."
          primaryAction={{ label: 'Nový účet', icon: UserPlus, onClick: () => scrollToSection('superadmin-create-user') }}
          secondaryActions={[{ label: 'Provozní logy', icon: Shield, onSelect: () => scrollToSection('superadmin-logs') }]}
        />

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {overviewStats.map((stat) => (
            <div key={stat.label} className={TILE_CLASS}>
              <span className={EYEBROW_CLASS}>{stat.label}</span>
              <strong className="text-page-title text-(--text-main)">{isLoading || isError ? '—' : stat.value}</strong>
              <p className="text-label text-(--text-muted)">{stat.meta}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="admin-layout-grid">
        <Card as="section" className="space-y-4" id="superadmin-users" data-testid="superadmin-users-section">
          <AdminCardHeading
            eyebrow="Systémové účty"
            title="Přehled uživatelů"
            meta={isLoading || isError ? 'Načítám…' : `${filteredUsers.length}/${users.length}`}
            description="Filtruj podle role, stavu nebo textu. Přímo z listu zablokuješ problémový účet a okamžitě vidíš, kdo má globální práva."
          />

          <div className="grid gap-3">
            <div className="relative">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--text-muted)" />
              <Input
                id="superadmin-user-search"
                type="search"
                className="pl-10"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Hledat podle jména nebo e-mailu"
                aria-label="Hledat podle jména nebo e-mailu"
                data-testid="superadmin-user-search-input"
              />
            </div>

            <FilterButtons label="Filtrovat účty podle role" options={roleFilters} value={roleFilter} onChange={setRoleFilter} testId="superadmin-role-filters" />
            <FilterButtons label="Filtrovat účty podle stavu" options={statusFilters} value={statusFilter} onChange={setStatusFilter} testId="superadmin-status-filters" />
          </div>

          {isLoading ? (
            <UserListSkeleton />
          ) : isError ? (
            <FeatureErrorFallback
              bare
              error={error instanceof Error ? error : new Error('Nepodařilo se načíst systémové uživatele')}
              resetErrorBoundary={() => {
                void refetch()
              }}
              title="Systémové účty se nepodařilo načíst"
            />
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              icon={users.length === 0 ? Users : SearchX}
              message={users.length === 0 ? 'Zatím tu nejsou žádné účty.' : 'Tomu filtru nic neodpovídá, zkus upravit filtry nebo hledání.'}
              action={hasFilters ? { label: 'Vyčistit filtry', onClick: resetFilters } : undefined}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-meta text-(--text-muted)">
                <span>
                  {hasFilters
                    ? `Zobrazuji ${formatCount(filteredUsers.length, 'účet', 'účty', 'účtů')} podle aktivních filtrů.`
                    : 'Účty jsou řazené podle privilegovanosti, stavu a data vytvoření.'}
                </span>
                {hasFilters ? (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    Vyčistit filtry
                  </Button>
                ) : null}
              </div>

              <ul className={USER_LIST_CLASS} data-testid="superadmin-users-list">
                {filteredUsers.map((user) => {
                  const statusMeta = getStatusMeta(user)
                  const isSelf = currentUser?.userId === user.id
                  const lockActionDisabled = isSelf || user.isSuperAdmin

                  return (
                    <ListRow
                      as="li"
                      key={user.id}
                      data-testid="superadmin-user-card"
                      data-user-id={user.id}
                      action={
                        <Button
                          size="sm"
                          variant={user.isBanned ? 'secondary' : 'danger'}
                          onClick={() => {
                            setBanError(null)
                            setPendingBanUser(user)
                          }}
                          disabled={lockActionDisabled}
                          title={
                            isSelf
                              ? 'Nelze měnit stav vlastního účtu.'
                              : user.isSuperAdmin
                                ? 'Nelze blokovat jiného Super Admina.'
                                : undefined
                          }
                          data-testid="superadmin-toggle-ban-button"
                        >
                          {user.isBanned ? 'Zrušit blokaci' : 'Zablokovat'}
                        </Button>
                      }
                    >
                      <div className="flex items-center gap-3">
                        <div aria-hidden="true" className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-primary md:inline-flex">
                          {memberInitial(user.username)}
                        </div>
                        <div className="grid min-w-0 gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold wrap-anywhere">{user.username}</span>
                            {isSelf ? <span className="admin-user-self-badge">Tvůj účet</span> : null}
                            {user.isSuperAdmin ? <span className="admin-role-badge admin-role-badge--superadmin">Super Admin</span> : null}
                            <span className={`admin-role-badge admin-role-badge--${user.role === 'admin' ? 'admin' : user.role === 'guest' ? 'guest' : 'member'}`}>
                              {getRoleLabel(user.role)}
                            </span>
                            <span className={statusMeta.className}>{statusMeta.label}</span>
                          </div>
                          <p className="flex flex-wrap gap-x-2 text-meta text-(--text-muted) wrap-anywhere">
                            <span>{user.email || 'Účet bez e-mailu'}</span>
                            <span aria-hidden="true">·</span>
                            <span>Založen {formatDate(user.createdAt) || 'neznámo kdy'}</span>
                          </p>
                        </div>
                      </div>
                    </ListRow>
                  )
                })}
              </ul>
            </>
          )}
        </Card>

        <aside className="admin-sidebar-stack">
          <Card as="section" className="space-y-4" id="superadmin-create-user" data-testid="superadmin-create-user-section">
            <AdminCardHeading
              eyebrow="Ruční založení"
              title="Vytvořit účet"
              description="Použij pro podporu, onboarding nebo ruční zásah. Po vytvoření dostaneš nouzové údaje i informaci, zda se povedlo doručit verifikační e-mail."
            />

            <form
              className="admin-compact-form admin-user-create-form"
              onSubmit={handleCreateUser}
              onChange={() => {
                if (createError) setCreateError(null)
              }}
              data-testid="superadmin-create-user-form"
            >
              <div className="form-group">
                <label htmlFor="superadmin-username">Uživatelské jméno</label>
                <Input id="superadmin-username" name="username" type="text" minLength={2} maxLength={50} required data-testid="superadmin-create-username-input" />
              </div>
              <div className="form-group">
                <label htmlFor="superadmin-email">E-mail</label>
                <Input id="superadmin-email" name="email" type="email" maxLength={255} required data-testid="superadmin-create-email-input" />
              </div>
              <div className="form-group">
                <label htmlFor="superadmin-role">Výchozí role</label>
                <select id="superadmin-role" name="role" defaultValue="user" data-testid="superadmin-create-role-select">
                  <option value="user">Člen</option>
                  <option value="admin">Admin</option>
                  <option value="guest">Host</option>
                </select>
              </div>
              <Button type="submit" className="w-full" pending={createUser.isPending} data-testid="superadmin-create-submit-button">
                {createUser.isPending ? null : <UserPlus aria-hidden="true" />}
                {createUser.isPending ? 'Zakládám…' : 'Vytvořit účet'}
              </Button>
            </form>

            {createError ? <div className="error-message show admin-section-error">{createError}</div> : null}
          </Card>

          <Card as="section">
            <AdminCardHeading
              eyebrow="Bezpečný handoff"
              title="Poslední vytvořený účet"
              description="Když onboarding e-mail odejde, zůstane tady jen shrnutí účtu. Nouzové údaje se ukážou jen při failu doručení nebo v prostředí bez SMTP."
            />

            {lastCreatedUser ? (
              <div className="grid gap-3">
                <div className={TILE_CLASS}>
                  <span className={EYEBROW_CLASS}>Účet</span>
                  <strong className="wrap-anywhere">{lastCreatedUser.user.username}</strong>
                  <span className="wrap-anywhere">{lastCreatedUser.user.email || 'Bez e-mailu'}</span>
                </div>

                {hasFallbackSecrets ? (
                  <>
                    <div className="grid gap-2 rounded-xl border border-dashed border-rule-soft p-3">
                      <Button variant="secondary" onClick={showSecrets ? hideSecrets : revealSecretsTemporarily}>
                        {showSecrets ? 'Skrýt citlivé údaje' : 'Zobrazit dočasně na 20 s'}
                      </Button>
                      <p className="text-label text-(--text-muted)">
                        Citlivé údaje drž schované, dokud je opravdu nepotřebuješ předat.
                      </p>
                    </div>

                    <div className={TILE_CLASS}>
                      <span className={EYEBROW_CLASS}>Dočasné heslo</span>
                      <code className={CODE_CLASS}>{showSecrets ? lastCreatedUser.tempPassword : 'Skryto. Nejdřív použij dočasné zobrazení.'}</code>
                      <Button variant="secondary" size="sm" className="w-full md:w-fit" onClick={() => copySecret('password', lastCreatedUser.tempPassword!)} disabled={!showSecrets}>
                        {copiedSecret === 'password' ? <><Check aria-hidden="true" /> Zkopírováno</> : <><Copy aria-hidden="true" /> Kopírovat</>}
                      </Button>
                    </div>

                    <div className={TILE_CLASS}>
                      <span className={EYEBROW_CLASS}>Fallback token</span>
                      <code className={CODE_CLASS}>{showSecrets ? lastCreatedUser.verificationToken : 'Skryto. Nejdřív použij dočasné zobrazení.'}</code>
                      <Button variant="secondary" size="sm" className="w-full md:w-fit" onClick={() => copySecret('token', lastCreatedUser.verificationToken!)} disabled={!showSecrets}>
                        {copiedSecret === 'token' ? <><Check aria-hidden="true" /> Zkopírováno</> : <><Copy aria-hidden="true" /> Kopírovat</>}
                      </Button>
                    </div>
                  </>
                ) : (
                  <EmptyState icon={Check} message="Ručně není potřeba nic předávat, onboarding e-mail obsahuje aktivační odkaz i dočasné heslo." />
                )}
              </div>
            ) : (
              <EmptyState icon={Inbox} message="Zatím není co předat, po vytvoření účtu se tady objeví shrnutí a případně nouzové údaje." />
            )}
          </Card>
        </aside>
      </div>

      <LogsPanel
        id="superadmin-logs"
        scopeKey="superadmin"
        eyebrow="Provoz"
        title="Systémové logy"
        description="Stejný log panel jako v cabin administraci, ale s globálním přístupem pro backoffice zásahy a diagnostiku produkčních problémů."
        loadLogFiles={superadminApi.getLogFiles}
        loadLogs={superadminApi.getLogs}
      />

      <ConfirmDialog
        isOpen={pendingBanUser !== null}
        title={pendingBanUser?.isBanned ? 'Zrušit blokaci účtu?' : 'Zablokovat účet?'}
        message={pendingBanUser?.isBanned
          ? `Opravdu chceš zrušit blokaci účtu „${pendingBanUser.username}“? Uživateli se okamžitě vrátí možnost přihlášení.`
          : `Opravdu chceš zablokovat účet „${pendingBanUser?.username}“? Uživatel se nebude moci přihlásit, dokud blokaci nezrušíš.`}
        confirmLabel={pendingBanUser?.isBanned ? 'Zrušit blokaci' : 'Zablokovat účet'}
        danger={!pendingBanUser?.isBanned}
        loading={toggleBan.isPending}
        errorMessage={banError}
        onConfirm={handleConfirmBan}
        onCancel={() => {
          setPendingBanUser(null)
          setBanError(null)
        }}
      />
    </div>
  )
}
