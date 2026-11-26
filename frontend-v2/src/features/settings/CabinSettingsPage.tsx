/**
 * features/settings/CabinSettingsPage.tsx
 * Admin-only cabin configuration: name, description, checklist, features.
 */
import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/shared/Card'
import { ListRow } from '@/components/shared/ListRow'
import { PageHeader } from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { useCabinSettings, useRemoveCoverPhoto, useUpdateCabinSettings } from './hooks/useCabinSettings'
import { showToast } from '@/lib/toast'
import { FeatureErrorFallback } from '@/components/shared/FeatureErrorFallback'
import { getNetworkAwareActionMessage } from '@/lib/networkError'
import type { MunicipalityOption } from '@/api/municipalities'
import { MunicipalityPicker } from '@/components/shared/MunicipalityPicker'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import type { CabinConfig } from '@/api/settings'

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CHECKLIST = [
  'Vypnuto a vypuštěno topení/voda',
  'Zavřené okenice',
  'Vybraný popel z kamen',
  'Vyprázdněná lednice',
  'Zamčeno',
]

const AVAILABLE_FEATURES = [
  { key: 'reservations', label: 'Rezervace', description: 'Kalendář rezervací chaty' },
  { key: 'shopping', label: 'Nákupy', description: 'Nákupní seznamy a zásoby' },
  { key: 'notes', label: 'Chat', description: 'Nástěnka a vlákna zpráv' },
  { key: 'gallery', label: 'Galerie', description: 'Fotoalbum a vzpomínky' },
  { key: 'diary', label: 'Deník', description: 'Deník pobytů' },
  { key: 'reconstruction', label: 'Rekonstrukce', description: 'Kanban board — nápady, firmy, úkoly' },
  { key: 'inventory', label: 'Zásoby', description: 'Správa zásob na chatě' },
]

type TabId = 'tab-basic' | 'tab-operations' | 'tab-modules'

/** Hodnoty formuláře, podle kterých se pozná neuložená změna. */
interface FormValues {
  name: string
  description: string
  municipalityCode: number | null
  municipalityPending: boolean
  legacyLocationRemoved: boolean
  welcomeMessage: string
  rules: string
  isWinterized: boolean
  checklist: string[]
  features: Record<string, boolean>
}

function checklistFromSettings(settings: CabinConfig): string[] {
  return settings.departureChecklist?.length ? settings.departureChecklist : DEFAULT_CHECKLIST
}

/** Chybějící klíč modulu znamená zapnutý, proto se porovnává výsledný stav, ne objekt. */
function formSnapshot(values: FormValues): string {
  return JSON.stringify({ ...values, features: AVAILABLE_FEATURES.map((f) => values.features[f.key] !== false) })
}

function savedSnapshot(settings: CabinConfig): string {
  return formSnapshot({
    name: settings.name ?? '',
    description: settings.description ?? '',
    municipalityCode: settings.municipalityCode && settings.municipalityName ? settings.municipalityCode : null,
    municipalityPending: false,
    legacyLocationRemoved: false,
    welcomeMessage: settings.welcomeMessage ?? '',
    rules: settings.rules ?? '',
    isWinterized: settings.isWinterized ?? false,
    checklist: checklistFromSettings(settings),
    features: settings.features ?? {},
  })
}

interface CabinSettingsPanelProps {
  /** Vlastní hlavička panelu. Ve správě ji nemá, tam stránku nese hlavička správy (jediné `h1`). */
  title?: string
  subtitle?: string
  showBackButton?: boolean
  onBack?: () => void
}

/** Část formuláře: nadpis karty a popisek, mezi částmi jen čára, žádná vnořená karta (DESIGN.md §6). */
function FormSection({ title, description, children, ...props }: { title: string; description: string; children: ReactNode; 'data-testid'?: string }) {
  return (
    <section className="py-6 first:pt-0 last:pb-0" {...props}>
      <div className="mb-4">
        <h2 className="text-card-title text-(--text-main)">{title}</h2>
        <p className="text-label text-(--text-muted)">{description}</p>
      </div>
      {children}
    </section>
  )
}

// ─── ChecklistEditor ──────────────────────────────────────────────────────────

interface ChecklistEditorProps {
  items: string[]
  onChange: (items: string[]) => void
}

function ChecklistEditor({ items, onChange }: ChecklistEditorProps) {
  function update(index: number, value: string) {
    const next = [...items]
    next[index] = value
    onChange(next)
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function add() {
    if (items.length >= 15) {
      showToast('Maximálně 15 položek v checklistu.', 'error')
      return
    }
    onChange([...items, ''])
  }

  return (
    <div data-testid="cabin-settings-checklist">
      <ul id="cs-checklist-container" className="mb-3 grid gap-2" data-testid="cabin-settings-checklist-list">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2" data-index={i} data-testid="cabin-settings-checklist-item">
            <Input
              type="text"
              value={item}
              onChange={(e) => update(i, e.target.value)}
              maxLength={100}
              placeholder="Položka checklistu"
              aria-label={`Položka checklistu ${i + 1}`}
              data-testid="cabin-settings-checklist-input"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label="Odebrat"
              onClick={() => remove(i)}
              data-testid="cabin-settings-checklist-remove-button"
            >
              <X aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="secondary" id="cs-add-checklist-item" onClick={add} data-testid="cabin-settings-checklist-add-button">
        <Plus aria-hidden="true" />
        Přidat položku
      </Button>
    </div>
  )
}

// ─── FeatureToggles ───────────────────────────────────────────────────────────

interface FeatureTogglesProps {
  features: Record<string, boolean>
  onChange: (features: Record<string, boolean>) => void
}

function FeatureToggles({ features, onChange }: FeatureTogglesProps) {
  function toggle(key: string, enabled: boolean) {
    onChange({ ...features, [key]: enabled })
  }

  // Řádky přes celou šířku karty (ListRow má odsazení karty sám), název, popis i políčko jsou jeden popisek.
  return (
    <ul className="-mx-4 divide-y divide-rule-soft md:-mx-6" data-testid="cabin-settings-feature-toggles">
      {AVAILABLE_FEATURES.map((f) => (
        <ListRow as="li" key={f.key} data-testid="cabin-settings-feature-toggle-row" data-feature={f.key}>
          <label className="flex cursor-pointer items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{f.label}</span>
              <span className="block text-label text-(--text-muted)">{f.description}</span>
            </span>
            <input
              type="checkbox"
              className="size-5 shrink-0 cursor-pointer accent-(--brand-primary)"
              data-feature={f.key}
              checked={features[f.key] !== false}
              onChange={(e) => toggle(f.key, e.target.checked)}
              data-testid="cabin-settings-feature-toggle"
            />
          </label>
        </ListRow>
      ))}
    </ul>
  )
}

// ─── CharCounter ──────────────────────────────────────────────────────────────

function CharCounter({ value, max }: { value: string; max: number }) {
  const len = value.length
  const isNear = len > max * 0.9
  return (
    <span className="cs-counter">
      <span className={cn(isNear && 'text-(--status-error)')}>{len}</span>/{max}
    </span>
  )
}

// ─── CabinSettingsPanel ───────────────────────────────────────────────────────

export function CabinSettingsPanel({
  title,
  subtitle,
  showBackButton = false,
  onBack,
}: CabinSettingsPanelProps) {
  const { isAdmin } = useAuth()
  const {
    data: settings,
    isLoading,
    isError,
    error: settingsError,
    refetch: refetchSettings,
  } = useCabinSettings()
  const updateSettings = useUpdateCabinSettings()
  const removeCoverPhoto = useRemoveCoverPhoto()

  const [activeTab, setActiveTab] = useState<TabId>('tab-basic')

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [municipality, setMunicipality] = useState<MunicipalityOption | null>(null)
  const [municipalityPending, setMunicipalityPending] = useState(false)
  const [legacyLocationRemoved, setLegacyLocationRemoved] = useState(false)
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [rules, setRules] = useState('')
  const [isWinterized, setIsWinterized] = useState(false)
  const [checklist, setChecklist] = useState<string[]>(DEFAULT_CHECKLIST)
  const [features, setFeatures] = useState<Record<string, boolean>>({})

  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Formulář se plní z nových dat ještě během vykreslení, ne v efektu: jinak by jedno vykreslení
  // porovnávalo prázdný formulář s uloženým snímkem a na chvíli hlásilo neuložené změny (#327).
  // Klíčem je snímek polí formuláře: změna titulní fotky (#321) rozepsané úpravy nepřepíše.
  const savedForm = useMemo(() => (settings ? savedSnapshot(settings) : null), [settings])
  const [populatedFrom, setPopulatedFrom] = useState<string | null>(null)
  if (settings && savedForm !== populatedFrom) {
    setPopulatedFrom(savedForm)
    setName(settings.name ?? '')
    setDescription(settings.description ?? '')
    setLegacyLocationRemoved(false)
    setMunicipality(
      settings.municipalityCode && settings.municipalityName
        ? { code: settings.municipalityCode, name: settings.municipalityName, district: settings.municipalityDistrict ?? '', region: settings.municipalityRegion ?? '' }
        : null,
    )
    setWelcomeMessage(settings.welcomeMessage ?? '')
    setRules(settings.rules ?? '')
    setIsWinterized(settings.isWinterized ?? false)
    setChecklist(checklistFromSettings(settings))
    setFeatures(settings.features ?? {})
  }

  const currentForm = formSnapshot({ name, description, municipalityCode: municipality?.code ?? null, municipalityPending,
    legacyLocationRemoved, welcomeMessage, rules, isWinterized, checklist, features })
  const isDirty = savedForm !== null && currentForm !== savedForm
  const leaveGuard = useUnsavedChangesGuard(isDirty)

  const clearSaveFeedback = useCallback(() => {
    if (saveError) setSaveError(null)
    if (saveSuccess) setSaveSuccess(false)
  }, [saveError, saveSuccess])

  const doSave = useCallback(() => {
    if (name.trim().length < 2) {
      showToast('Název chaty musí mít alespoň 2 znaky.', 'error')
      return
    }

    // Napsaný text bez výběru obce neukládat.
    if (municipalityPending) {
      showToast('Vyber nejbližší obec ze seznamu, nebo pole vymaž.', 'error')
      return
    }
    // Bez výběru zůstane stará textová lokalita; smazání obce nebo odebrání staré lokality pošle null.
    const municipalityCode = municipality ? municipality.code : settings?.municipalityCode || legacyLocationRemoved ? null : undefined

    const cleanChecklist = checklist.map((s) => s.trim()).filter((s) => s.length > 0)

    setSaveError(null)
    setSaveSuccess(false)

    updateSettings.mutate(
      {
        name: name.trim(),
        description: description.trim() || null,
        welcomeMessage: welcomeMessage.trim() || null,
        municipalityCode,
        rules: rules.trim() || null,
        departureChecklist: cleanChecklist,
        isWinterized,
        features,
      },
      {
        onSuccess: () => {
          setSaveError(null)
          showToast('Nastavení uloženo.', 'success')
          setSaveSuccess(true)
          if (successTimerRef.current) clearTimeout(successTimerRef.current)
          successTimerRef.current = setTimeout(() => setSaveSuccess(false), 2500)
        },
        onError: (error) => {
          setSaveError(
            getNetworkAwareActionMessage(
              error,
              'Nastavení chaty se nepodařilo uložit. Zkus to znovu.',
              'Spojení vypadlo dřív, než se nastavení chaty stihlo uložit. Zkus to znovu po obnovení připojení.',
            ),
          )
        },
      },
    )
  }, [name, description, welcomeMessage, municipality, municipalityPending, legacyLocationRemoved, settings, rules, isWinterized, checklist, features, updateSettings])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      doSave()
    },
    [doSave],
  )

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
    }
  }, [])

  // Guard: admin only
  if (!isAdmin) {
    return (
      <Card>
        <PageHeader title="Přístup odepřen" subtitle="Tato stránka je dostupná pouze pro administrátory." />
      </Card>
    )
  }

  const TAB_LABELS: Record<TabId, string> = {
    'tab-basic': 'Základní',
    'tab-operations': 'Provoz a údržba',
    'tab-modules': 'Moduly',
  }
  const panelState = isLoading ? 'loading' : isError ? 'error' : 'ready'
  // `cs-tab-pane` drží prolnutí při přepnutí záložky a test, že Uložit změny leží mimo záložky (#260).
  const tabPane = (tab: TabId) => ({
    role: 'tabpanel', id: tab, 'aria-labelledby': `${tab}-button`, hidden: activeTab !== tab,
    className: cn('cs-tab-pane divide-y divide-rule-soft', activeTab === tab && 'active'),
  })

  const saveBtnText = updateSettings.isPending ? 'Ukládám…' : saveSuccess ? 'Uloženo' : 'Uložit změny'

  return (
    <div className="grid gap-4 md:gap-6" data-testid="cabin-settings-panel" data-cabin-settings-state={panelState}>
      {title ? (
        <Card as="section">
          {showBackButton ? (
            <Button
              variant="ghost"
              className="-ml-2 px-2 text-primary"
              aria-label="Zpět na správu chaty"
              onClick={onBack}
              data-testid="cabin-settings-back-button"
            >
              <ChevronLeft aria-hidden="true" />
              Zpět
            </Button>
          ) : null}
          <PageHeader title={title} subtitle={subtitle} />
        </Card>
      ) : null}

      <Card as="section" flush aria-label="Nastavení chaty">
        {/* Na mobilu je lišta s uložením pevně dole, poslední pole pod ní nesmí zůstat. */}
        <div className="p-4 max-md:pb-24 md:p-6">
          {saveError ? (
            <div className="error-message show mb-4" role="alert" data-testid="cabin-settings-save-error">{saveError}</div>
          ) : null}

          {/* Segmentový přepínač: tři záložky v jedné řadě i na 360 px, vybraná je papír na vnořené ploše. */}
          <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-inset p-1 md:w-fit" role="tablist" aria-label="Části nastavení" data-testid="cabin-settings-tab-nav">
            {(['tab-basic', 'tab-operations', 'tab-modules'] as TabId[]).map((tab) => (
              <Button
                key={tab}
                type="button"
                variant="ghost"
                size="sm"
                role="tab"
                id={`${tab}-button`}
                aria-selected={activeTab === tab}
                aria-controls={tab}
                className={cn('flex-auto px-2 text-(--text-muted)', activeTab === tab && 'bg-sheet text-(--text-main) shadow-xs hover:bg-sheet')}
                onClick={() => setActiveTab(tab)}
                data-testid="cabin-settings-tab-button"
                data-tab-id={tab}
              >
                {TAB_LABELS[tab]}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <div className="grid gap-4" aria-busy="true">
              <span className="sr-only">Načítám nastavení…</span>
              {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-inset" />)}
            </div>
          ) : isError ? (
            <FeatureErrorFallback
              bare
              error={settingsError instanceof Error ? settingsError : new Error('Nepodařilo se načíst nastavení chaty')}
              resetErrorBoundary={() => {
                void refetchSettings()
              }}
              title="Nastavení chaty se nepodařilo načíst"
            />
          ) : (
            <form id="cs-form" noValidate onSubmit={handleSubmit} onChangeCapture={clearSaveFeedback} data-testid="cabin-settings-form">
              {/* Tab 1: Basic */}
              <div {...tabPane('tab-basic')} data-testid="cabin-settings-basic-tab">
                <FormSection title="Titulní fotka" description="Fotka chaty, kterou uvidí všichni členové" data-testid="cabin-settings-cover-photo">
                  {settings?.coverPhotoUrl ? (
                    <div className="flex flex-col items-start gap-3">
                      <img
                        src={settings.coverPhotoUrl}
                        alt="Titulní fotka chaty"
                        width={1920}
                        height={1200}
                        decoding="async"
                        className="w-full max-w-md h-auto aspect-[16/10] object-cover object-center rounded-xl"
                        data-testid="cabin-settings-cover-photo-preview"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        pending={removeCoverPhoto.isPending}
                        aria-label="Odebrat titulní fotku"
                        onClick={() => removeCoverPhoto.mutate(undefined, { onSuccess: () => showToast('Titulní fotka odebrána.', 'success') })}
                        data-testid="cabin-settings-cover-photo-remove-button"
                      >
                        {removeCoverPhoto.isPending ? 'Odebírám…' : 'Odebrat'}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-body text-(--text-muted)">V Galerii u fotky zvol Nastavit jako titulní.</p>
                  )}
                </FormSection>

                <FormSection title="Základní informace" description="Jak se chata jmenuje a kde se nachází">
                  <div className="form-group">
                    <label htmlFor="cs-name">Název chaty</label>
                    <Input
                      type="text"
                      id="cs-name"
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="např. Chalupa pod Kletí"
                      required
                      data-testid="cabin-settings-name-input"
                    />
                    <span className="cs-hint">Zobrazuje se v navigaci a pozvánkách</span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="cs-description">
                      Popis <span className="cs-optional">(nepovinné)</span>
                    </label>
                    <textarea
                      id="cs-description"
                      maxLength={2000}
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Útulná chaloupka v podhůří Kleti s krásným výhledem…"
                      data-testid="cabin-settings-description-input"
                    />
                    <CharCounter value={description} max={2000} />
                  </div>

                  <div className="form-group mb-0">
                    <label htmlFor="cs-municipality">
                      Nejbližší obec (pro počasí){' '}
                      <span className="cs-optional">(nepovinné)</span>
                    </label>
                    <MunicipalityPicker
                      id="cs-municipality"
                      value={municipality}
                      onChange={setMunicipality}
                      onPendingChange={setMunicipalityPending}
                      placeholder="Např. Třebenice"
                      testId="cabin-settings-municipality-input"
                    />
                    {settings?.weatherLocation && !settings.municipalityCode && !legacyLocationRemoved && (
                      <span className="cs-hint" data-testid="cabin-settings-legacy-location">
                        Teď je uložená jen jako text: „{settings.weatherLocation}“. Vyber obec ze seznamu, ať počasí
                        chodí ze správného místa.{' '}
                        <Button type="button" variant="ghost" size="sm" className="-ml-3 text-primary underline" onClick={() => setLegacyLocationRemoved(true)}>
                          Odebrat starou lokalitu
                        </Button>
                      </span>
                    )}
                    <span className="cs-hint">
                      Z bezpečnostních důvodů neukládáme přesnou adresu ani GPS chaty, jen nejbližší obec.
                    </span>
                  </div>
                </FormSection>

                <FormSection title="Uvítání a pravidla" description="Nastav tón komunikace chaty">
                  <div className="form-group">
                    <label htmlFor="cs-welcome">
                      Uvítací zpráva nebo motto <span className="cs-optional">(nepovinné)</span>
                    </label>
                    <textarea
                      id="cs-welcome"
                      maxLength={300}
                      rows={2}
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      placeholder="např. U nás je vždy příjemně, ať prší nebo svítí"
                      data-testid="cabin-settings-welcome-message-input"
                    />
                    <span className="cs-hint">Zobrazí se novým členům v pozvánce a na přehledu</span>
                  </div>

                  <div className="form-group mb-0">
                    <label htmlFor="cs-rules">
                      Domácí řád <span className="cs-optional">(nepovinné)</span>
                    </label>
                    <textarea
                      id="cs-rules"
                      maxLength={5000}
                      rows={6}
                      value={rules}
                      onChange={(e) => setRules(e.target.value)}
                      placeholder={'1. Při odjezdu zavřít okna a okenice\n2. Dřevo nosit z kůlny, ne od sousedů'}
                      data-testid="cabin-settings-rules-input"
                    />
                    <CharCounter value={rules} max={5000} />
                  </div>
                </FormSection>
              </div>

              {/* Tab 2: Operations */}
              <div {...tabPane('tab-operations')} data-testid="cabin-settings-operations-tab">
                <FormSection title="Odjezdový checklist" description="Co zkontrolovat před uzamčením chaty">
                  <ChecklistEditor
                    items={checklist}
                    onChange={(items) => {
                      clearSaveFeedback()
                      setChecklist(items)
                    }}
                  />
                </FormSection>

                <FormSection title="Zazimování" description="Stav chaty v zimním období">
                  <label className="flex min-h-(--touch-target-min) cursor-pointer items-start gap-3 py-2">
                    <input
                      type="checkbox"
                      id="cs-winterized"
                      className="mt-0.5 size-5 shrink-0 cursor-pointer accent-(--brand-primary)"
                      checked={isWinterized}
                      onChange={(e) => setIsWinterized(e.target.checked)}
                      data-testid="cabin-settings-winterized-toggle"
                    />
                    <span>
                      <span className="block font-semibold">Chata je zazimovaná</span>
                      <span className="cs-hint">Zapojí mrazové výstrahy a speciální režim</span>
                    </span>
                  </label>
                </FormSection>
              </div>

              {/* Tab 3: Modules */}
              <div {...tabPane('tab-modules')} data-testid="cabin-settings-modules-tab">
                <FormSection title="Aktivní moduly" description="Zapni nebo vypni funkce podle potřeb rodiny">
                  <FeatureToggles
                    features={features}
                    onChange={(nextFeatures) => {
                      clearSaveFeedback()
                      setFeatures(nextFeatures)
                    }}
                  />
                </FormSection>
              </div>
            </form>
          )}
        </div>

        {/* ── Lišta s uložením: mimo záložky, aby byla po ruce na každé z nich (#260) ── */}
        {panelState === 'ready' ? (
          <div className="cs-save-bar" data-testid="cabin-settings-save-bar">
            <span className="cs-save-status" role="status">
              {isDirty ? 'Máš neuložené změny.' : ''}
            </span>
            <Button
              type="button"
              size="lg"
              className="cs-btn-save"
              onClick={doSave}
              pending={updateSettings.isPending}
              data-testid="cabin-settings-save-button"
            >
              {saveBtnText}
            </Button>
          </div>
        ) : null}
      </Card>

      <ConfirmDialog
        isOpen={leaveGuard.isBlocked}
        title="Odejít bez uložení?"
        message="V nastavení chaty máš neuložené změny. Když teď odejdeš, ztratíš je."
        confirmLabel="Odejít bez uložení"
        cancelLabel="Zůstat"
        danger
        onConfirm={leaveGuard.proceed}
        onCancel={leaveGuard.stay}
      />
    </div>
  )
}

// ─── CabinSettingsPage ────────────────────────────────────────────────────────

export function CabinSettingsPage() {
  useDocumentTitle('Správa chaty')
  const navigate = useNavigate()

  return (
    <div className="p-3 md:p-0" data-testid="cabin-settings-page">
      <CabinSettingsPanel
        title="Nastavení chaty"
        subtitle="Přizpůsob si svou chatu podle sebe"
        showBackButton={true}
        onBack={() => navigate('/admin')}
      />
    </div>
  )
}
