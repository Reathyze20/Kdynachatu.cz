/**
 * features/landing/WaitlistForm.tsx
 * Zápis do waitlistu na landing page (#696, spec #692): e-mail, „kdo jsi“ a souhlas. Ref z URL (`?ref=`) se
 * přečte při načtení a pošle se se zápisem. Po úspěchu formulář nahradí poděkování. Validuje server
 * (`waitlistSignupSchema`), jeho chyby se ukážou u polí. Bez React Query: landing page stojí i mimo QueryClient.
 */
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card } from '@/components/shared/Card'
import { waitlistApi, type WaitlistSegment } from '@/api/waitlist'
import { getNetworkAwareActionMessage } from '@/lib/networkError'

const SEGMENTS: { value: WaitlistSegment; label: string }[] = [
  { value: 'rodina', label: 'Rodina' },
  { value: 'spolek', label: 'Oddíl nebo spolek' },
  { value: 'firma', label: 'Firma' },
  { value: 'pronajimatel', label: 'Pronajímám chatu' },
  { value: 'jine', label: 'Jiné' },
]

/** Server ref stejně ořízne na 64 znaků; delší by jen zbytečně cestoval. */
const REF_MAX_LENGTH = 64

type Field = 'email' | 'segment' | 'consent'
type FieldErrors = Partial<Record<Field, string>>

type ApiError = { response?: { status?: number; data?: { message?: string; errors?: { path: string; message: string }[] } } }

const fieldId = (field: Field) => `waitlist-${field}`
const errorId = (field: Field) => `waitlist-${field}-error`

export function WaitlistForm() {
  const [searchParams] = useSearchParams()
  const [ref] = useState(() => searchParams.get('ref')?.trim().slice(0, REF_MAX_LENGTH) || null)
  const [email, setEmail] = useState('')
  const [segment, setSegment] = useState<WaitlistSegment | ''>('')
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setFieldErrors({})
    setFormError(null)
    try {
      // Prázdný segment a nezaškrtnutý souhlas odmítne server s hláškou u pole.
      await waitlistApi.signUp({ email, segment: segment as WaitlistSegment, consent, ref, website })
      setDone(true)
    } catch (error) {
      const data = (error as ApiError).response?.data
      const errors = (data?.errors ?? []).filter((e): e is { path: Field; message: string } =>
        e.path === 'email' || e.path === 'segment' || e.path === 'consent')
      if (errors.length > 0) {
        setFieldErrors(Object.fromEntries(errors.map((e) => [e.path, e.message])))
      } else {
        setFormError(data?.message ?? getNetworkAwareActionMessage(error, 'Zápis se nepodařil. Zkus to znovu.',
          'Spojení vypadlo dřív, než se zápis stihl odeslat. Zkus to znovu po obnovení připojení.'))
      }
    } finally {
      setPending(false)
    }
  }

  if (done) {
    return (
      <Card className="text-left" data-testid="waitlist-thanks">
        <p role="status" className="text-card-title text-(--text-main)">Díky, jsi na seznamu.</p>
        <p className="mt-2 text-body text-(--text-main)">
          Na e-mail ti přijde potvrzení. Když na něj odpovíš, jak to u tebe na chatě funguje, moc mi pomůžeš.
        </p>
      </Card>
    )
  }

  const errorProps = (field: Field) =>
    fieldErrors[field] ? { invalid: true, 'aria-describedby': errorId(field) } : {}
  const fieldError = (field: Field) =>
    fieldErrors[field] ? (
      <p id={errorId(field)} className="mt-1 text-label text-(--status-error-dark)">{fieldErrors[field]}</p>
    ) : null

  return (
    <Card as="div" className="text-left">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" data-testid="waitlist-form">
        <div>
          <label htmlFor={fieldId('email')} className="mb-1 block text-label text-(--text-muted)">E-mail</label>
          <Input
            id={fieldId('email')}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={255}
            {...errorProps('email')}
          />
          {fieldError('email')}
        </div>

        <div>
          <label htmlFor={fieldId('segment')} className="mb-1 block text-label text-(--text-muted)">Kdo jsi</label>
          <Select
            id={fieldId('segment')}
            value={segment}
            onChange={(e) => setSegment(e.target.value as WaitlistSegment | '')}
            {...errorProps('segment')}
          >
            <option value="" disabled>Vyber…</option>
            {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          {fieldError('segment')}
        </div>

        <div>
          <label className="flex min-h-(--touch-target-min) items-start gap-3 text-body text-(--text-main)">
            <Checkbox
              id={fieldId('consent')}
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
              aria-invalid={fieldErrors.consent ? true : undefined}
              aria-describedby={fieldErrors.consent ? errorId('consent') : undefined}
            />
            <span>
              Souhlasím se zpracováním e-mailu kvůli zápisu na seznam zájemců. Uloží se nejdéle na 24 měsíců
              a smazat ho můžu kdykoli odpovědí na potvrzovací e-mail.
            </span>
          </label>
          {fieldError('consent')}
          <p className="mt-1 text-meta text-(--text-muted)">
            Podrobnosti najdeš v{' '}
            <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">ochraně soukromí</Link>.
          </p>
        </div>

        {/* Honeypot: člověk pole nevidí ani na něj nedojde Tabem, bot ho vyplní. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="waitlist-website">Web</label>
          <Input id="waitlist-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>

        {formError && <p role="alert" className="text-label text-(--status-error-dark)">{formError}</p>}

        <Button type="submit" size="lg" pending={pending}>{pending ? 'Zapisuju…' : 'Zapsat se'}</Button>
      </form>
    </Card>
  )
}
