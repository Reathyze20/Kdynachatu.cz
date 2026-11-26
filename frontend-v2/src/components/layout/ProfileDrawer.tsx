/**
 * components/layout/ProfileDrawer.tsx
 * Šuplík profilu: osobní údaje, zabezpečení a pro správce rychlé odkazy do správy (#524).
 * Nápovědu nenese: na mobilu je v menu Víc (vidět vždy), na desktopu v sidebaru.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { PromptDialog } from '@/components/shared/PromptDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { membersApi } from '@/api/members'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/context/AuthContext'
import { useLogout } from '@/hooks/useLogout'
import { LogoutPendingChangesDialog } from '@/components/layout/LogoutPendingChangesDialog'
import { showToast } from '@/lib/toast'
import { AVATARS } from '@/lib/avatars'
import { FALLBACK_MEMBER_COLOR, MEMBER_PALETTE, toMemberColor } from '@/lib/memberPalette'
import { AnimalAvatar } from '@/components/shared/AnimalAvatar'
import { listRowLinkClass } from '@/components/shared/ListRow'
import { useNavigate } from 'react-router-dom'
import { LogOut, ScrollText, Shield } from 'lucide-react'
import { ADMIN_NAV } from '@/lib/navRoutes'
import { useCabinSceneMode, type CabinSceneMode } from '@/hooks/useCabinSceneMode'

/** Volba „Scéna chaty“ (#565): scéna na Přehledu (později i maskot na liště), jen v tomto zařízení. */
const SCENE_MODES: { value: CabinSceneMode; label: string }[] = [
  { value: 'animated', label: 'Animovaná' },
  { value: 'static', label: 'Statická' },
  { value: 'hidden', label: 'Skrytá' },
]

interface ProfileData {
  email: string
  color: string
  animalIcon: string | null
}

interface ProfileDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function ProfileDrawer({ isOpen, onClose }: ProfileDrawerProps) {
  const { updateAnimalIcon, logout, isAdmin, isSuperAdmin, user, token, login } = useAuth()
  // Šuplík se zavře až při odhlášení, jinak by s ním zmizel i dotaz na neodeslané změny (#537)
  const { requestLogout, pendingDialog } = useLogout(onClose)
  const logoutHintId = useId()
  const sceneHeadingId = useId()
  const [sceneMode, setSceneMode] = useCabinSceneMode()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'personal' | 'security'>('personal')

  // ─── Email state ────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState(false)
  const [emailMessage, setEmailMessage] = useState('')
  // Změna e-mailu chce současné heslo (#475)
  const [emailPassword, setEmailPassword] = useState('')
  const [emailPasswordError, setEmailPasswordError] = useState('')

  // ─── Color / Avatar state ───────────────────────────────────────────────────
  const [selectedColor, setSelectedColor] = useState(FALLBACK_MEMBER_COLOR)
  const [selectedAnimal, setSelectedAnimal] = useState('')

  // ─── Security form ──────────────────────────────────────────────────────────
  const oldPasswordRef = useRef<HTMLInputElement>(null)
  const newPasswordRef = useRef<HTMLInputElement>(null)
  const newPasswordConfirmRef = useRef<HTMLInputElement>(null)
  const [securityMessage, setSecurityMessage] = useState('')
  const [securityError, setSecurityError] = useState(false)

  // ─── Delete account state ────────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ─── Logout everywhere state ────────────────────────────────────────────────
  const [showLogoutEverywhereConfirm, setShowLogoutEverywhereConfirm] = useState(false)
  const [logoutEverywhereLoading, setLogoutEverywhereLoading] = useState(false)
  const [logoutEverywhereError, setLogoutEverywhereError] = useState('')

  // ─── Leave cabin state ──────────────────────────────────────────────────────
  const [showLeaveCabinConfirm, setShowLeaveCabinConfirm] = useState(false)
  const [leaveCabinLoading, setLeaveCabinLoading] = useState(false)
  const [leaveCabinError, setLeaveCabinError] = useState('')

  // ─── Zavřít klávesou Escape ─────────────────────────────────────────────────
  // Otevřený dotaz na neodeslané změny si Escape vyřídí sám; šuplík by se zavřel s ním (#537)
  const dialogAbove = pendingDialog.isOpen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dialogAbove) onClose() }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose, dialogAbove])

  // ─── Načíst profil ──────────────────────────────────────────────────────────
  const { data: profileData } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiClient.get<ProfileData>('/users/me').then((r) => r.data),
    enabled: isOpen,
  })

  useEffect(() => {
    if (profileData) {
      setEmail(profileData.email ?? '')
      setSelectedColor(profileData.color ?? FALLBACK_MEMBER_COLOR)
      setSelectedAnimal(profileData.animalIcon ?? '')
    }
  }, [profileData])

  useEffect(() => {
    if (isOpen) return

    setActiveTab('personal')
    setEmail(profileData?.email ?? '')
    setEmailError(false)
    setEmailMessage('')
    setEmailPassword('')
    setEmailPasswordError('')
    setSelectedColor(profileData?.color ?? FALLBACK_MEMBER_COLOR)
    setSelectedAnimal(profileData?.animalIcon ?? '')
    setSecurityMessage('')
    setSecurityError(false)
    setShowDeleteConfirm(false)
    setDeleteLoading(false)
    setShowLogoutEverywhereConfirm(false)
    setLogoutEverywhereLoading(false)
    setLogoutEverywhereError('')
    setShowLeaveCabinConfirm(false)
    setLeaveCabinLoading(false)
    setLeaveCabinError('')
  }, [isOpen, profileData])

  // ─── Auto-save color / animal ───────────────────────────────────────────────
  const patchMutation = useMutation({
    mutationFn: (payload: { color?: string; animalIcon?: string }) =>
      apiClient.patch('/users/me', payload).then((r) => r.data),
    onSuccess: (_, variables) => {
      if (variables.animalIcon !== undefined) {
        updateAnimalIcon(variables.animalIcon)
      }
      showToast('Změny uloženy.', 'success')
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
    onError: () => showToast('Změny se nepodařilo uložit. Zkus to znovu.', 'error'),
  })

  function handleColorSelect(color: string) {
    if (selectedColor === color) return
    setSelectedColor(color)
    patchMutation.mutate({ color })
  }

  function handleAnimalSelect(icon: string) {
    if (selectedAnimal === icon) return
    setSelectedAnimal(icon)
    patchMutation.mutate({ animalIcon: icon })
  }

  // ─── Změnit e-mail ──────────────────────────────────────────────────────────
  const emailChanged = email.trim() !== (profileData?.email ?? '')

  async function handleChangeEmail() {
    const emailVal = email.trim()
    if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      // Text chyby formátu nese #profile-email-error, emailMessage je jen pro selhání serveru.
      setEmailMessage('')
      setEmailError(true)
      return
    }
    if (!emailChanged) return
    if (!emailPassword) {
      setEmailPasswordError('Pro změnu e-mailu zadej své současné heslo.')
      return
    }
    try {
      await authApi.changeMyEmail(emailVal, emailPassword)
      setEmailMessage('')
      setEmailPassword('')
      showToast('E-mail změněn.', 'success')
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { message?: string } } })?.response
      if (response?.status === 403) {
        setEmailPasswordError(response.data?.message ?? 'Nesprávné heslo. Zkus to znovu.')
      } else {
        setEmailMessage('E-mail se nepodařilo změnit. Zkus to znovu.')
      }
    }
  }

  function handleEmailBlur() {
    const val = email.trim()
    if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setEmailError(true)
    } else {
      setEmailError(false)
    }
  }

  // ─── Změnit heslo ───────────────────────────────────────────────────────────
  async function handleSecuritySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const oldPassword = oldPasswordRef.current!.value
    const newPassword = newPasswordRef.current!.value
    const newPasswordConfirm = newPasswordConfirmRef.current!.value

    if (newPassword !== newPasswordConfirm) {
      setSecurityMessage('Hesla se neshodují.')
      setSecurityError(true)
      newPasswordConfirmRef.current?.classList.add('is-invalid')
      return
    }

    const form = e.currentTarget
    try {
      const res = await authApi.changeMyPassword(oldPassword, newPassword)
      // Změna hesla zneplatnila všechna přihlášení (#485); tohle zařízení pokračuje s novým tokenem.
      if (user) {
        login({
          token: res.token,
          username: user.username,
          userId: user.userId,
          role: user.role,
          animalIcon: user.animalIcon,
          cabinId: user.cabinId,
          isSuperAdmin: user.isSuperAdmin,
          remember: localStorage.getItem('authToken') !== null,
        })
      }
      setSecurityMessage('')
      setSecurityError(false)
      form.reset()
      showToast('Heslo změněno.', 'success')
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string } } })?.response?.data
      setSecurityMessage(data?.message || 'Chyba.')
      setSecurityError(true)
    }
  }

  // ─── Exportovat data (GDPR) ─────────────────────────────────────────────────
  async function handleExportData() {
    try {
      const res = await apiClient.get('/users/me/export', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'moje-data.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('Data exportována.', 'success')
    } catch {
      showToast('Data se nepodařilo exportovat. Zkus to znovu.', 'error')
    }
  }

  // ─── Smazat účet (GDPR) ────────────────────────────────────────────────────
  async function handleDeleteAccount(password: string) {
    if (!password) return

    setDeleteLoading(true)
    try {
      await apiClient.delete('/users/me', { data: { password } })
      showToast('Účet smazán.', 'success')
      logout()
      navigate('/')
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string } } })?.response?.data
      showToast(data?.message || 'Účet se nepodařilo smazat. Zkus to znovu.', 'error')
    } finally {
      setDeleteLoading(false)
    }
  }

  // ─── Odhlásit všude (#485) ──────────────────────────────────────────────────
  async function handleLogoutEverywhere() {
    setLogoutEverywhereLoading(true)
    setLogoutEverywhereError('')
    try {
      await authApi.logoutEverywhere()
      setShowLogoutEverywhereConfirm(false)
      showToast('Odhlášeno na všech zařízeních.', 'success')
      logout()
    } catch {
      setLogoutEverywhereError('Odhlášení se nepovedlo. Zkus to znovu.')
    } finally {
      setLogoutEverywhereLoading(false)
    }
  }

  async function handleLeaveCabin() {
    if (!user || !token) return

    setLeaveCabinLoading(true)
    setLeaveCabinError('')

    try {
      const response = await membersApi.leaveCabin() as { message?: string }
      const remember = localStorage.getItem('authToken') !== null

      login({
        token,
        username: user.username,
        userId: user.userId,
        role: 'user',
        animalIcon: user.animalIcon,
        cabinId: null,
        isSuperAdmin: user.isSuperAdmin,
        remember,
      })

      queryClient.clear()
      setShowLeaveCabinConfirm(false)
      onClose()
      showToast(response.message || 'Už nejsi v této chatě.', 'success')
      navigate(user.isSuperAdmin ? '/superadmin' : '/onboarding', { replace: true })
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string } } })?.response?.data
      setLeaveCabinError(data?.message || 'Chyba při opouštění chaty.')
    } finally {
      setLeaveCabinLoading(false)
    }
  }

  function handleNavigate(path: string) {
    onClose()
    navigate(path)
  }

  if (!isOpen) return null

  return (
    <div
      id="profile-drawer-overlay"
      className="drawer-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      data-testid="profile-drawer-overlay"
    >
      <div id="profile-drawer" className="drawer-content right-drawer" data-testid="profile-drawer">
        <div className="drawer-header">
          <h2 className="text-page-title text-(--text-main)">Můj profil</h2>
          <button
            className="close-drawer"
            id="close-profile-drawer"
            aria-label="Zavřít"
            onClick={onClose}
            data-testid="profile-drawer-close-button"
          >
            &times;
          </button>
        </div>

        <div className="drawer-body">
          {(isAdmin || isSuperAdmin) && (
            <div className="drawer-section">
              <h3 className="text-card-title text-(--text-main)">Správa</h3>
              <div className="-mx-4 flex flex-col md:-mx-6">
                {isAdmin ? (
                  <button type="button" className={listRowLinkClass} onClick={() => handleNavigate(ADMIN_NAV.to)}>
                    <ADMIN_NAV.icon size={20} aria-hidden="true" />
                    <span>{ADMIN_NAV.label}</span>
                  </button>
                ) : null}

                {isAdmin ? (
                  <button type="button" className={listRowLinkClass} onClick={() => handleNavigate('/admin/diagnostics#system-info')}>
                    <ScrollText size={20} aria-hidden="true" />
                    <span>Diagnostika</span>
                  </button>
                ) : null}

                {isSuperAdmin ? (
                  <button type="button" className={listRowLinkClass} onClick={() => handleNavigate('/superadmin')}>
                    <Shield size={20} aria-hidden="true" />
                    <span>Backoffice</span>
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* Segmented Control */}
          <div className="segmented-control">
            <button
              className={`segmented-btn${activeTab === 'personal' ? ' active' : ''}`}
              data-target="profile-tab-personal"
              onClick={() => setActiveTab('personal')}
              data-testid="profile-tab-personal-button"
            >
              Osobní údaje
            </button>
            <button
              className={`segmented-btn${activeTab === 'security' ? ' active' : ''}`}
              data-target="profile-tab-security"
              onClick={() => setActiveTab('security')}
              data-testid="profile-tab-security-button"
            >
              Zabezpečení
            </button>
          </div>

          {/* Personal Info Tab */}
          <div
            id="profile-tab-personal"
            className={`drawer-tab-content${activeTab === 'personal' ? ' active-tab' : ' hidden'}`}
            data-testid="profile-tab-personal"
          >
            <div className="drawer-section">
              <h3 className="text-card-title text-(--text-main)">Kontaktní údaje</h3>
              <div className="form-group">
                <label htmlFor="profile-email">E-mailová adresa</label>
                <div className="drawer-email-row" style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="email"
                    id="profile-email"
                    name="email"
                    className={`form-control${emailError ? ' is-invalid' : ''}`}
                    maxLength={255}
                    placeholder="neco@neco.cz"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={handleEmailBlur}
                    aria-invalid={emailError || undefined}
                    aria-describedby={emailError ? 'profile-email-error' : emailMessage ? 'profile-email-message' : undefined}
                    data-testid="profile-email-input"
                  />
                  <button
                    type="button"
                    id="btn-change-email"
                    className="button-secondary"
                    style={{ whiteSpace: 'nowrap', padding: '0 15px' }}
                    onClick={handleChangeEmail}
                    data-testid="profile-change-email-button"
                  >
                    Změnit
                  </button>
                </div>
                {emailError && (
                  <div id="profile-email-error" className="error-message show" role="alert" style={{ marginTop: '5px', textAlign: 'left' }}>
                    Zadej e-mail ve správném formátu.
                  </div>
                )}
                {emailMessage && !emailError && (
                  <p id="profile-email-message" className="error-message show" role="alert" style={{ marginTop: '5px', textAlign: 'left' }}>
                    {emailMessage}
                  </p>
                )}
                {emailChanged && (
                  <div className="mt-3">
                    <label htmlFor="profile-email-password">Současné heslo</label>
                    <Input
                      type="password"
                      id="profile-email-password"
                      autoComplete="current-password"
                      maxLength={100}
                      value={emailPassword}
                      onChange={(e) => { setEmailPassword(e.target.value); setEmailPasswordError('') }}
                      invalid={Boolean(emailPasswordError)}
                      aria-describedby={`profile-email-password-hint${emailPasswordError ? ' profile-email-password-error' : ''}`}
                      data-testid="profile-email-password-input"
                    />
                    <p id="profile-email-password-hint" className="mt-1 text-label text-(--text-muted)">Na původní adresu pošleme upozornění o změně.</p>
                    {emailPasswordError && <p id="profile-email-password-error" className="mt-1 text-label text-(--status-error)" role="alert">{emailPasswordError}</p>}
                  </div>
                )}
              </div>
            </div>

            <div className="drawer-section">
              <h3 className="text-card-title text-(--text-main)">Vzhled profilu</h3>
              <div className="form-group">
                <p id="profile-color-label" className="text-label text-(--text-muted)">Barva</p>
                <div id="profile-color-grid" className="swatch-grid" role="group" aria-labelledby="profile-color-label">
                  {MEMBER_PALETTE.map(({ hex, name }) => (
                    <div
                      key={hex}
                      className={`color-swatch${toMemberColor(selectedColor) === hex ? ' active' : ''}`}
                      style={{ backgroundColor: hex }}
                      tabIndex={0}
                      role="button"
                      aria-label={name}
                      aria-pressed={toMemberColor(selectedColor) === hex}
                      title={name}
                      onClick={() => handleColorSelect(hex)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleColorSelect(hex) } }}
                    />
                  ))}
                </div>
                <input type="hidden" id="profile-color" value={selectedColor} readOnly />
              </div>

              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <p id="profile-avatar-label" className="text-label text-(--text-muted)">Avatar</p>
                <div id="profile-avatar-grid" className="avatar-grid" role="group" aria-labelledby="profile-avatar-label">
                  {AVATARS.map((avatar) => (
                    <div
                      key={avatar.id}
                      className={`avatar-icon${selectedAnimal === avatar.id ? ' active' : ''}`}
                      tabIndex={0}
                      role="button"
                      title={avatar.label}
                      onClick={() => handleAnimalSelect(avatar.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAnimalSelect(avatar.id) } }}
                    >
                      <AnimalAvatar icon={avatar.id} username={avatar.label} size={40} />
                    </div>
                  ))}
                </div>
                <input type="hidden" id="profile-animal-icon" value={selectedAnimal} readOnly />
              </div>
            </div>

            <div className="drawer-section">
              <h3 id={sceneHeadingId} className="text-card-title text-(--text-main)">Scéna chaty</h3>
              <div role="group" aria-labelledby={sceneHeadingId} className="flex flex-wrap gap-2">
                {SCENE_MODES.map(({ value, label }) => (
                  <Button key={value} size="sm" variant={sceneMode === value ? 'primary' : 'secondary'} aria-pressed={sceneMode === value} onClick={() => setSceneMode(value)}>
                    {label}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-label text-(--text-muted)">Obrázek chaty na Přehledu. Volba platí jen v tomto zařízení.</p>
            </div>
          </div>

          {/* Security Tab */}
          <div
            id="profile-tab-security"
            className={`drawer-tab-content${activeTab === 'security' ? ' active-tab' : ' hidden'}`}
            data-testid="profile-tab-security"
          >
            <div className="drawer-section">
              <h3 className="text-card-title text-(--text-main)">Zabezpečení účtu</h3>
              <form
                id="profile-security-form"
                style={{ marginTop: '1.5rem' }}
                onSubmit={handleSecuritySubmit}
                data-testid="profile-security-form"
              >
                <div className="form-group">
                  <label htmlFor="profile-old-password">Staré heslo</label>
                  <input type="password" id="profile-old-password" name="oldPassword" className="form-control" maxLength={100} required ref={oldPasswordRef} data-testid="profile-old-password-input" />
                </div>
                <div className="form-group">
                  <label htmlFor="profile-new-password">Nové heslo</label>
                  <input type="password" id="profile-new-password" name="newPassword" className="form-control" minLength={8} maxLength={100} required ref={newPasswordRef} data-testid="profile-new-password-input" />
                </div>
                <div className="form-group">
                  <label htmlFor="profile-new-password-confirm">Potvrdit nové heslo</label>
                  <input type="password" id="profile-new-password-confirm" name="newPasswordConfirm" className="form-control" minLength={8} maxLength={100} required ref={newPasswordConfirmRef} data-testid="profile-new-password-confirm-input" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                  <button type="submit" className="button-primary" style={{ width: '100%' }} data-testid="profile-change-password-button">Změnit heslo</button>
                </div>
                {securityMessage && (
                  <p
                    id="profile-security-message"
                    className={`message ${securityError ? 'text-(--status-error)' : 'text-(--status-success)'}`}
                  >
                    {securityMessage}
                  </p>
                )}
              </form>
            </div>

            <div className="drawer-section mt-8">
              <h3 className="text-card-title text-(--text-main)">Přihlášená zařízení</h3>
              <p id={logoutHintId} className="mt-2 mb-4 text-label text-(--text-muted)">
                Odhlásí tě jen na tomhle zařízení. Hodí se, když telefon nebo tablet předáváš dalšímu z rodiny.
              </p>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                aria-describedby={logoutHintId}
                onClick={requestLogout}
                data-testid="profile-logout-button"
              >
                <LogOut aria-hidden="true" />
                Odhlásit
              </Button>

              <LogoutPendingChangesDialog {...pendingDialog} />

              <p className="mt-6 mb-4 text-label text-(--text-muted)">
                Ztracený telefon nebo cizí počítač? Odhlas se všude najednou, i na tomhle zařízení.
              </p>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-destructive"
                onClick={() => {
                  setLogoutEverywhereError('')
                  setShowLogoutEverywhereConfirm(true)
                }}
                data-testid="profile-logout-everywhere-button"
              >
                Odhlásit všude
              </Button>

              <ConfirmDialog
                isOpen={showLogoutEverywhereConfirm}
                title="Odhlásit všude?"
                message="Odhlásíme tě na všech zařízeních, i na tomhle. Potom se znovu přihlásíš heslem."
                errorMessage={logoutEverywhereError || undefined}
                confirmLabel="Odhlásit všude"
                cancelLabel="Zrušit"
                danger
                loading={logoutEverywhereLoading}
                onConfirm={() => {
                  void handleLogoutEverywhere()
                }}
                onCancel={() => {
                  if (logoutEverywhereLoading) return
                  setShowLogoutEverywhereConfirm(false)
                  setLogoutEverywhereError('')
                }}
              />
            </div>

            <div className="drawer-section" style={{ marginTop: '2rem' }}>
              <h3 className="text-card-title text-(--text-main)">Členství v chatě</h3>
              <p className="mt-2 mb-4 text-label text-(--text-muted)">
                Opustíš aktuální chatu, ale účet ti zůstane. Potom můžeš přijmout novou pozvánku nebo založit vlastní chatu.
              </p>
              <p className="mb-4 text-label text-(--text-muted)">
                Pokud jsi poslední admin, nejdřív předej roli admina jinému členovi.
              </p>

              <button
                type="button"
                className="button-danger"
                style={{ width: '100%' }}
                onClick={() => {
                  setLeaveCabinError('')
                  setShowLeaveCabinConfirm(true)
                }}
                data-testid="profile-leave-cabin-button"
              >
                Opustit tuto chatu
              </button>

              <ConfirmDialog
                isOpen={showLeaveCabinConfirm}
                title="Opravdu opustit chatu?"
                message="Ztratíš přístup k rezervacím, nákupům, poznámkám a dalším datům této chaty. Účet ti zůstane a po potvrzení přejdeš do onboardingu."
                errorMessage={leaveCabinError || undefined}
                confirmLabel="Opustit chatu"
                cancelLabel="Zůstat"
                danger
                loading={leaveCabinLoading}
                onConfirm={() => {
                  void handleLeaveCabin()
                }}
                onCancel={() => {
                  if (leaveCabinLoading) return
                  setShowLeaveCabinConfirm(false)
                  setLeaveCabinError('')
                }}
              />
            </div>

            {/* GDPR — Export & Delete */}
            <div className="drawer-section" style={{ marginTop: '2rem' }}>
              <h3 className="text-card-title text-(--text-main)">Tvoje data (GDPR)</h3>
              <p className="mt-2 mb-4 text-label text-(--text-muted)">
                Máš právo si stáhnout svá data nebo smazat svůj účet.
              </p>

              <button
                type="button"
                className="button-secondary"
                style={{ width: '100%', marginBottom: '0.75rem' }}
                onClick={handleExportData}
              >
                Exportovat moje data (JSON)
              </button>

              <button
                type="button"
                className="button-danger"
                style={{ width: '100%' }}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Smazat můj účet
              </button>

              <PromptDialog
                isOpen={showDeleteConfirm}
                title="Smazat můj účet"
                description="Tato akce je nevratná. Smažeme všechna tvoje data."
                label="Potvrď heslem"
                inputType="password"
                autoComplete="current-password"
                submitLabel="Nenávratně smazat"
                loadingLabel="Mažu…"
                danger
                loading={deleteLoading}
                trimValue={false}
                onSubmit={handleDeleteAccount}
                onCancel={() => setShowDeleteConfirm(false)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
