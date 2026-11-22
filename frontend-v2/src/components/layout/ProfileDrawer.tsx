/**
 * components/layout/ProfileDrawer.tsx
 * Překlad: #profile-drawer-overlay z index.html + initProfileDrawer() z main.ts
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { PromptDialog } from '@/components/shared/PromptDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { membersApi } from '@/api/members'
import { useAuth } from '@/context/AuthContext'
import { showToast } from '@/lib/toast'
import { AVATARS } from '@/lib/avatars'
import { FALLBACK_MEMBER_COLOR, MEMBER_PALETTE, toMemberColor } from '@/lib/memberPalette'
import { AnimalAvatar } from '@/components/shared/AnimalAvatar'
import { useNavigate } from 'react-router-dom'
import { Download, ScrollText, Settings, Shield } from 'lucide-react'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { promptPwaInstall } from '@/lib/pwaInstall'

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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canInstall } = usePwaInstall()
  const [activeTab, setActiveTab] = useState<'personal' | 'security'>('personal')

  // ─── Email state ────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState(false)
  const [emailMessage, setEmailMessage] = useState('')

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

  // ─── Leave cabin state ──────────────────────────────────────────────────────
  const [showLeaveCabinConfirm, setShowLeaveCabinConfirm] = useState(false)
  const [leaveCabinLoading, setLeaveCabinLoading] = useState(false)
  const [leaveCabinError, setLeaveCabinError] = useState('')

  // ─── Zavřít klávesou Escape ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

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
    setSelectedColor(profileData?.color ?? FALLBACK_MEMBER_COLOR)
    setSelectedAnimal(profileData?.animalIcon ?? '')
    setSecurityMessage('')
    setSecurityError(false)
    setShowDeleteConfirm(false)
    setDeleteLoading(false)
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
      showToast('Změny uloženy', 'success')
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
    onError: () => showToast('Nepodařilo se uložit, zkus to prosím znovu.', 'error'),
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
  async function handleChangeEmail() {
    const emailVal = email.trim()
    if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      setEmailMessage('Nesprávný formát e-mailu.')
      setEmailError(true)
      return
    }
    try {
      await apiClient.patch('/users/me', { email: emailVal })
      setEmailMessage('')
      setEmailError(false)
      showToast('E-mail změněn', 'success')
    } catch {
      setEmailMessage('Chyba.')
      setEmailError(true)
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

    try {
      const res = await apiClient.patch('/users/me/password', { oldPassword, newPassword })
      if (res.status === 200) {
        setSecurityMessage('')
        setSecurityError(false)
        ;(e.currentTarget as HTMLFormElement).reset()
        showToast('Heslo úspěšně změněno', 'success')
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string } } })?.response?.data
      setSecurityMessage(data?.message || 'Chyba.')
      setSecurityError(true)
      showToast('Nepodařilo se změnit heslo', 'error')
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
      showToast('Data exportována', 'success')
    } catch {
      showToast('Chyba při exportu dat', 'error')
    }
  }

  // ─── Smazat účet (GDPR) ────────────────────────────────────────────────────
  async function handleDeleteAccount(password: string) {
    if (!password) return

    setDeleteLoading(true)
    try {
      await apiClient.delete('/users/me', { data: { password } })
      showToast('Tvůj účet byl smazán', 'success')
      logout()
      navigate('/')
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string } } })?.response?.data
      showToast(data?.message || 'Chyba při mazání účtu', 'error')
    } finally {
      setDeleteLoading(false)
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
      showToast(response.message || 'Chata opuštěna.', 'success')
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
          <h2>Můj profil</h2>
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
          {canInstall ? (
            <div className="drawer-section" data-testid="profile-install-app">
              <h3>Aplikace v telefonu</h3>
              {canInstall === 'prompt' ? (
                <div className="drawer-quicklinks">
                  <button
                    type="button"
                    className="button-secondary drawer-quicklink"
                    onClick={() => { void promptPwaInstall() }}
                  >
                    <Download size={16} />
                    <span>Nainstalovat na plochu</span>
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  V Safari klepni na tlačítko Sdílet a zvol <strong>„Přidat na plochu“</strong>.
                </p>
              )}
            </div>
          ) : null}

          {(isAdmin || isSuperAdmin) && (
            <div className="drawer-section">
              <h3>Správa a diagnostika</h3>
              <div className="drawer-quicklinks">
                {isAdmin ? (
                  <button
                    type="button"
                    className="button-secondary drawer-quicklink"
                    onClick={() => handleNavigate('/admin')}
                  >
                    <Settings size={16} />
                    <span>Administrativa</span>
                  </button>
                ) : null}

                {isAdmin ? (
                  <button
                    type="button"
                    className="button-secondary drawer-quicklink"
                    onClick={() => handleNavigate('/admin/diagnostics#system-info')}
                  >
                    <ScrollText size={16} />
                    <span>Statistiky a logy</span>
                  </button>
                ) : null}

                {isSuperAdmin ? (
                  <button
                    type="button"
                    className="button-secondary drawer-quicklink"
                    onClick={() => handleNavigate('/superadmin')}
                  >
                    <Shield size={16} />
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
              <h3>Kontaktní údaje</h3>
              <div className="form-group">
                <label htmlFor="profile-email">E-mailová adresa:</label>
                <div className="drawer-email-row" style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="email"
                    id="profile-email"
                    name="email"
                    className="form-control"
                    maxLength={255}
                    placeholder="neco@neco.cz"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={handleEmailBlur}
                    style={emailError ? { borderColor: 'var(--color-danger)' } : undefined}
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
                  <div id="profile-email-error" className="error-message" style={{ marginTop: '5px', textAlign: 'left' }}>
                    Zadej e-mail ve správném formátu.
                  </div>
                )}
                {emailMessage && !emailError && (
                  <p id="profile-email-message" className="message" style={{ marginTop: '5px', textAlign: 'left' }}>
                    {emailMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="drawer-section">
              <h3>Vzhled profilu</h3>
              <div className="form-group">
                <label>Vyber si barvu:</label>
                <div id="profile-color-grid" className="swatch-grid">
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
                <label>Tvůj avatar:</label>
                <div id="profile-avatar-grid" className="avatar-grid">
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
          </div>

          {/* Security Tab */}
          <div
            id="profile-tab-security"
            className={`drawer-tab-content${activeTab === 'security' ? ' active-tab' : ' hidden'}`}
            data-testid="profile-tab-security"
          >
            <div className="drawer-section">
              <h3>Zabezpečení účtu</h3>
              <form
                id="profile-security-form"
                style={{ marginTop: '1.5rem' }}
                onSubmit={handleSecuritySubmit}
                data-testid="profile-security-form"
              >
                <div className="form-group">
                  <label htmlFor="profile-old-password">Staré heslo:</label>
                  <input type="password" id="profile-old-password" name="oldPassword" className="form-control" maxLength={100} required ref={oldPasswordRef} data-testid="profile-old-password-input" />
                </div>
                <div className="form-group">
                  <label htmlFor="profile-new-password">Nové heslo:</label>
                  <input type="password" id="profile-new-password" name="newPassword" className="form-control" minLength={8} maxLength={100} required ref={newPasswordRef} data-testid="profile-new-password-input" />
                </div>
                <div className="form-group">
                  <label htmlFor="profile-new-password-confirm">Potvrdit nové heslo:</label>
                  <input type="password" id="profile-new-password-confirm" name="newPasswordConfirm" className="form-control" minLength={8} maxLength={100} required ref={newPasswordConfirmRef} data-testid="profile-new-password-confirm-input" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                  <button type="submit" className="button-primary" style={{ width: '100%' }} data-testid="profile-change-password-button">Změnit heslo</button>
                </div>
                {securityMessage && (
                  <p
                    id="profile-security-message"
                    className="message"
                    style={{ color: securityError ? 'var(--color-danger)' : 'var(--color-success)' }}
                  >
                    {securityMessage}
                  </p>
                )}
              </form>
            </div>

            <div className="drawer-section" style={{ marginTop: '2rem' }}>
              <h3>Členství v chatě</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.5rem 0 1rem' }}>
                Opustíš aktuální chatu, ale účet ti zůstane. Potom můžeš přijmout novou pozvánku nebo založit vlastní chatu.
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
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
              <h3>Tvoje data (GDPR)</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.5rem 0 1rem' }}>
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
                description="Tato akce je nevratná. Všechna tvoje data budou smazána."
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
