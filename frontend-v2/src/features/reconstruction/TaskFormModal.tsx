/**
 * features/reconstruction/TaskFormModal.tsx
 * Modal for creating/editing reconstruction items (idea / company / task).
 */
import { useState, useEffect, useRef } from 'react'
import type { CompanyStatus, RecItem, RecItemCreate, RecCategory } from '@/api/reconstruction'
import { Modal } from '@/components/shared/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { Building2, Hammer, Lightbulb } from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  initialCategory: RecCategory
  editItem: RecItem | null
  onClose: () => void
  onSubmit: (data: RecItemCreate) => void
  isLoading?: boolean
  errorMessage?: string | null
  onDirty?: () => void
}

// ─── Dialog titles ────────────────────────────────────────────────────────────

const DIALOG_TITLES: Record<RecCategory, { create: string; edit: string }> = {
  idea: { create: 'Nový nápad', edit: 'Upravit nápad' },
  company: { create: 'Nová firma', edit: 'Upravit firmu' },
  task: { create: 'Nový úkol', edit: 'Upravit úkol' },
}

const CATEGORY_TABS: Array<{ value: RecCategory; label: string; icon: LucideIcon }> = [
  { value: 'idea', label: 'Nápad', icon: Lightbulb },
  { value: 'company', label: 'Firma', icon: Building2 },
  { value: 'task', label: 'Úkol', icon: Hammer },
]

function getInitialCompanyStatus(editItem: RecItem | null): CompanyStatus {
  if (editItem?.category !== 'company') {
    return 'pending'
  }

  if (editItem.status === 'contacted' || editItem.status === 'approved' || editItem.status === 'rejected') {
    return editItem.status
  }

  return 'pending'
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function TaskFormModal({ initialCategory, editItem, onClose, onSubmit, isLoading, errorMessage, onDirty }: Props) {
  const [category, setCategory] = useState<RecCategory>(
    editItem ? editItem.category : initialCategory,
  )
  const [title, setTitle] = useState(editItem?.title ?? '')
  const [description, setDescription] = useState(editItem?.description ?? '')
  const [link, setLink] = useState(editItem?.link ?? '')
  const [thumbnail, setThumbnail] = useState(editItem?.thumbnail ?? '')
  // Idea and task share one cost, so it survives a category change in edit mode.
  const [cost, setCost] = useState<string>(editItem && editItem.category !== 'company' ? String(editItem.cost ?? '') : '')
  const [phone, setPhone] = useState(editItem?.phone ?? '')
  const [email, setEmail] = useState(editItem?.email ?? '')
  const [companyLink, setCompanyLink] = useState(editItem?.link ?? '')
  const [companyStatus, setCompanyStatus] = useState<CompanyStatus>(getInitialCompanyStatus(editItem))
  const [deadline, setDeadline] = useState(
    editItem?.category === 'task' ? (editItem.deadline ? editItem.deadline.split('T')[0] : '') : '',
  )

  const isEdit = !!editItem
  const modalTitle = DIALOG_TITLES[category][isEdit ? 'edit' : 'create']

  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleInputRef.current?.focus()
  }, [])

  // Sync initial category when prop changes (e.g. opening fresh modal)
  useEffect(() => {
    if (!editItem) setCategory(initialCategory)
  }, [initialCategory, editItem])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    const data: RecItemCreate = { category, title: title.trim(), description: description.trim() }
    if (category === 'idea') {
      data.link = link.trim()
      data.thumbnail = thumbnail.trim()
      if (cost) data.cost = Number(cost)
    } else if (category === 'company') {
      data.phone = phone.trim()
      data.email = email.trim()
      data.link = companyLink.trim()
      data.status = companyStatus
    } else if (category === 'task') {
      data.deadline = deadline || undefined
      if (cost) data.cost = Number(cost)
    }
    onSubmit(data)
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={modalTitle}
      maxWidth="max-w-lg"
      footer={
        <div className="modal-dialog-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading} data-testid="reconstruction-cancel-button">Zrušit</Button>
          <Button type="submit" form="rec-task-form" pending={isLoading} data-testid="reconstruction-submit-button">
            {isLoading ? 'Ukládám…' : isEdit ? 'Uložit změny' : 'Přidat položku'}
          </Button>
        </div>
      }
    >
      <form id="rec-task-form" className="flex flex-col" onSubmit={handleSubmit} onChangeCapture={() => onDirty?.()} data-testid="reconstruction-item-form">
          {/* Category – in edit mode it moves the card to another column without dragging */}
          <div className="form-group">
            <span id="rec-category-label" className="mb-1.5 block text-label text-(--text-main)">Kategorie</span>
            {/* Segmented control: three segments in one row even at 360 px, the selected one is paper on the inset track. */}
            <div className="flex gap-1 rounded-xl bg-inset p-1" role="group" aria-labelledby="rec-category-label" data-testid="reconstruction-category-tabs">
              {CATEGORY_TABS.map(({ value, label, icon: Icon }) => {
                const isActive = category === value
                return (
                  <Button
                    key={value}
                    type="button"
                    variant="ghost"
                    className={cn('flex-1 px-2 text-(--text-muted)', isActive && 'bg-sheet text-(--text-main) shadow-xs hover:bg-sheet')}
                    aria-pressed={isActive}
                    onClick={() => {
                      onDirty?.()
                      setCategory(value)
                    }}
                    data-testid="reconstruction-category-tab"
                    data-category={value}
                  >
                    <Icon aria-hidden="true" />
                    {label}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div className="form-group">
            <label htmlFor="rec-title">Název</label>
            <Input
              ref={titleInputRef}
              id="rec-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              data-testid="reconstruction-title-input"
              placeholder={
                category === 'idea'
                  ? 'Např. Nová terasa ze dřeva'
                  : category === 'company'
                    ? 'Např. Tesařství Novák s.r.o.'
                    : 'Např. Opravit střechu nad vchodem'
              }
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="rec-desc">Popis (nepovinné)</label>
            <Textarea
              id="rec-desc"
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              data-testid="reconstruction-description-input"
            />
          </div>

          {/* Idea fields */}
          {category === 'idea' && (
            <div id="dynamic-fields-idea" className="dynamic-fields">
              <div className="form-group">
                <label htmlFor="rec-link-idea">Odkaz (nepovinné)</label>
                <Input
                  id="rec-link-idea"
                  type="url"
                  value={link ?? ''}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://..."
                  data-testid="reconstruction-idea-link-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="rec-thumbnail">Náhledový obrázek (nepovinné)</label>
                <Input
                  id="rec-thumbnail"
                  type="url"
                  value={thumbnail ?? ''}
                  onChange={(e) => setThumbnail(e.target.value)}
                  placeholder="https://..."
                  data-testid="reconstruction-idea-thumbnail-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="rec-cost-idea">Odhadovaná cena (nepovinné)</label>
                <Input
                  id="rec-cost-idea"
                  type="number"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0"
                  data-testid="reconstruction-idea-cost-input"
                />
              </div>
            </div>
          )}

          {/* Company fields */}
          {category === 'company' && (
            <div id="dynamic-fields-company" className="dynamic-fields">
              <div className="form-group">
                <label htmlFor="rec-phone">Telefon (nepovinné)</label>
                <Input
                  id="rec-phone"
                  type="tel"
                  value={phone ?? ''}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+420 123 456 789"
                  data-testid="reconstruction-company-phone-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="rec-email">E-mail (nepovinné)</label>
                <Input
                  id="rec-email"
                  type="email"
                  value={email ?? ''}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="firma@example.cz"
                  data-testid="reconstruction-company-email-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="rec-link-company">Web (nepovinné)</label>
                <Input
                  id="rec-link-company"
                  type="url"
                  value={companyLink ?? ''}
                  onChange={(e) => setCompanyLink(e.target.value)}
                  placeholder="https://..."
                  data-testid="reconstruction-company-link-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="rec-status-company">Stav</label>
                <select
                  id="rec-status-company"
                  className="form-input"
                  value={companyStatus}
                  onChange={(e) => setCompanyStatus(e.target.value as CompanyStatus)}
                  data-testid="reconstruction-company-status-select"
                >
                  <option value="pending">Čeká na kontakt</option>
                  <option value="contacted">Kontaktováno</option>
                  <option value="approved">Schváleno</option>
                  <option value="rejected">Zamítnuto</option>
                </select>
              </div>
            </div>
          )}

          {/* Task fields */}
          {category === 'task' && (
            <div id="dynamic-fields-task" className="dynamic-fields">
              <div className="form-group">
                <label htmlFor="rec-deadline">Termín (nepovinné)</label>
                <Input
                  id="rec-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  data-testid="reconstruction-task-deadline-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="rec-cost-task">Odhadovaná cena (nepovinné)</label>
                <Input
                  id="rec-cost-task"
                  type="number"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0"
                  data-testid="reconstruction-task-cost-input"
                />
              </div>
            </div>
          )}
          {errorMessage ? (
            <div className="error-message show" role="alert" data-testid="reconstruction-form-error">{errorMessage}</div>
          ) : null}

      </form>
    </Modal>
  )
}
