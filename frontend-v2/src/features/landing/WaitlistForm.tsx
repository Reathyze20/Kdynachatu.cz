/**
 * features/landing/WaitlistForm.tsx
 * Zápis do waitlistu na landing page (#696, spec #692): e-mail, „kdo jsi“ a souhlas, k tomu dobrovolné otázky
 * (#699): domácnosti, ochota platit, co štve a pronájem. „Co by ti nejvíc pomohlo“ se ukáže jen při „Občas“
 * nebo „Ano“ a jinak se neodešle. Ref z URL (`?ref=`) se přečte při načtení a pošle se se zápisem. Po úspěchu
 * formulář nahradí poděkování. Validuje server (`waitlistSignupSchema`), jeho chyby se ukážou u polí.
 * Bez React Query: landing page stojí i mimo QueryClient.
 *
 * `prefill` předvyplní segment nebo záměr pronájmu (CTA z bloků landing page, #701). Každý nový objekt se
 * použije znovu, i když je formulář už vykreslený; ostatní vyplněná pole zůstanou. Rodič proto drží `prefill`
 * ve stavu a nový objekt vytvoří jen při kliknutí na CTA (inline literál by volbu návštěvníka přepsal při každém
 * vykreslení).
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/shared/Card'
import {
  waitlistApi,
  type WaitlistHouseholds,
  type WaitlistRentalIntent,
  type WaitlistRentalNeed,
  type WaitlistSegment,
  type WaitlistWillingnessToPay,
} from '@/api/waitlist'
import { getNetworkAwareActionMessage } from '@/lib/networkError'

const SEGMENTS: { value: WaitlistSegment; label: string }[] = [
  { value: 'rodina', label: 'Rodina' },
  { value: 'spolek', label: 'Oddíl nebo spolek' },
  { value: 'firma', label: 'Firma' },
  { value: 'pronajimatel', label: 'Pronajímám chatu' },
  { value: 'jine', label: 'Jiné' },
]

const HOUSEHOLDS: { value: WaitlistHouseholds; label: string }[] = [
  { value: '2', label: '2' },
  { value: '3-4', label: '3–4' },
  { value: '5+', label: '5 a víc' },
]

const WILLINGNESS_TO_PAY: { value: WaitlistWillingnessToPay; label: string }[] = [
  { value: '0', label: '0 Kč' },
  { value: 'do-500', label: 'Do 500 Kč' },
  { value: '500-1000', label: '500–1 000 Kč' },
  { value: 'nad-1000', label: 'Přes 1 000 Kč' },
]

const RENTAL_INTENTS: { value: WaitlistRentalIntent; label: string }[] = [
  { value: 'ne', label: 'Ne' },
  { value: 'obcas', label: 'Občas, když ji nepoužíváme' },
  { value: 'ano', label: 'Ano, hlavně kvůli pronájmu' },
]

const RENTAL_NEEDS: { value: WaitlistRentalNeed; label: string }[] = [
  { value: 'rezervace-hostu', label: 'Rezervace a obsazenost pro hosty' },
  { value: 'zalohy-platby', label: 'Zálohy a platby' },
  { value: 'predani-klicu', label: 'Instrukce a předání klíčů hostům' },
  { value: 'uklid-mezi-hosty', label: 'Úklid a kontrola mezi hosty' },
  { value: 'kalendar-booking-airbnb', label: 'Propojení s kalendářem Booking/Airbnb' },
  { value: 'rozpocitani-prijmu', label: 'Rozpočítání příjmů mezi spolumajitele' },
]

/** Server ref stejně ořízne na 64 znaků; delší by jen zbytečně cestoval. */
const REF_MAX_LENGTH = 64
/** Stejný limit jako `WAITLIST_PAIN_POINT_MAX_LENGTH` na serveru. */
const PAIN_POINT_MAX_LENGTH = 1000

const FIELDS = ['email', 'segment', 'consent', 'households', 'willingnessToPay', 'painPoint', 'rentalIntent', 'rentalNeeds'] as const
type Field = (typeof FIELDS)[number]
type FieldErrors = Partial<Record<Field, string>>

type ApiError = { response?: { status?: number; data?: { message?: string; errors?: { path: string; message: string }[] } } }

/** Předvyplnění z CTA landing page (#701). */
export interface WaitlistPrefill {
  segment?: WaitlistSegment
  rentalIntent?: WaitlistRentalIntent
}

const fieldId = (field: Field) => `waitlist-${field}`
const errorId = (field: Field) => `waitlist-${field}-error`
const isField = (path: string): path is Field => (FIELDS as readonly string[]).includes(path)
const asksRentalNeeds = (intent: WaitlistRentalIntent | '') => intent === 'obcas' || intent === 'ano'

export function WaitlistForm({ prefill }: { prefill?: WaitlistPrefill | null }) {
  const [searchParams] = useSearchParams()
  const [ref] = useState(() => searchParams.get('ref')?.trim().slice(0, REF_MAX_LENGTH) || null)
  const [email, setEmail] = useState('')
  const [segment, setSegment] = useState<WaitlistSegment | ''>(prefill?.segment ?? '')
  const [households, setHouseholds] = useState<WaitlistHouseholds | ''>('')
  const [willingnessToPay, setWillingnessToPay] = useState<WaitlistWillingnessToPay | ''>('')
  const [painPoint, setPainPoint] = useState('')
  const [rentalIntent, setRentalIntent] = useState<WaitlistRentalIntent | ''>(prefill?.rentalIntent ?? '')
  const [rentalNeeds, setRentalNeeds] = useState<WaitlistRentalNeed[]>([])
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (prefill?.segment) setSegment(prefill.segment)
    if (prefill?.rentalIntent) setRentalIntent(prefill.rentalIntent)
  }, [prefill])

  const showsRentalNeeds = asksRentalNeeds(rentalIntent)

  const toggleRentalNeed = (need: WaitlistRentalNeed, checked: boolean) =>
    setRentalNeeds((current) =>
      RENTAL_NEEDS.map((n) => n.value).filter((value) => (value === need ? checked : current.includes(value))))

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setFieldErrors({})
    setFormError(null)
    const trimmedPainPoint = painPoint.trim()
    try {
      // Prázdný segment a nezaškrtnutý souhlas odmítne server s hláškou u pole. Nevyplněné dobrovolné
      // odpovědi se neposílají, potřeby pronájmu jen při „Občas“ nebo „Ano“.
      await waitlistApi.signUp({
        email,
        segment: segment as WaitlistSegment,
        consent,
        ref,
        website,
        ...(households ? { households } : {}),
        ...(willingnessToPay ? { willingnessToPay } : {}),
        ...(trimmedPainPoint ? { painPoint: trimmedPainPoint } : {}),
        ...(rentalIntent ? { rentalIntent } : {}),
        ...(showsRentalNeeds && rentalNeeds.length > 0 ? { rentalNeeds } : {}),
      })
      setDone(true)
    } catch (error) {
      const data = (error as ApiError).response?.data
      // Chyba položky pole (`rentalNeeds.0`) patří celé skupině.
      const errors = (data?.errors ?? [])
        .map((e) => ({ path: e.path.split('.')[0], message: e.message }))
        .filter((e): e is { path: Field; message: string } => isField(e.path))
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
  const fieldLabel = (field: Field, text: string) => (
    <label htmlFor={fieldId(field)} className="mb-1 block text-label text-(--text-muted)">{text}</label>
  )

  return (
    <Card as="div" className="text-left">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" data-testid="waitlist-form">
        <div>
          {fieldLabel('email', 'E-mail')}
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
          {fieldLabel('segment', 'Kdo jsi')}
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

        <p className="text-body text-(--text-muted)">
          Když chceš, odpověz ještě na pár otázek. Pomůžou mi rozhodnout, co stavět dál.
        </p>

        <div>
          {fieldLabel('households', 'Kolik domácností chatu sdílí (nepovinné)')}
          <Select
            id={fieldId('households')}
            value={households}
            onChange={(e) => setHouseholds(e.target.value as WaitlistHouseholds | '')}
            {...errorProps('households')}
          >
            <option value="">Neuvádím</option>
            {HOUSEHOLDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {fieldError('households')}
        </div>

        <div>
          {fieldLabel('willingnessToPay', 'Kolik by ti stálo za to platit ročně (nepovinné)')}
          <Select
            id={fieldId('willingnessToPay')}
            value={willingnessToPay}
            onChange={(e) => setWillingnessToPay(e.target.value as WaitlistWillingnessToPay | '')}
            {...errorProps('willingnessToPay')}
          >
            <option value="">Neuvádím</option>
            {WILLINGNESS_TO_PAY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {fieldError('willingnessToPay')}
        </div>

        <div>
          {fieldLabel('painPoint', 'Co tě na sdílené chatě nejvíc štve (nepovinné)')}
          <Textarea
            id={fieldId('painPoint')}
            rows={3}
            value={painPoint}
            onChange={(e) => setPainPoint(e.target.value)}
            maxLength={PAIN_POINT_MAX_LENGTH}
            {...errorProps('painPoint')}
          />
          <p className="mt-1 text-right text-meta text-(--text-muted)">{painPoint.length}/{PAIN_POINT_MAX_LENGTH}</p>
          {fieldError('painPoint')}
        </div>

        <div>
          {fieldLabel('rentalIntent', 'Pronajímáš (nebo chceš pronajímat) chatu cizím lidem (nepovinné)')}
          <Select
            id={fieldId('rentalIntent')}
            value={rentalIntent}
            onChange={(e) => setRentalIntent(e.target.value as WaitlistRentalIntent | '')}
            {...errorProps('rentalIntent')}
          >
            <option value="">Neuvádím</option>
            {RENTAL_INTENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {fieldError('rentalIntent')}
        </div>

        {showsRentalNeeds && (
          <fieldset aria-describedby={fieldErrors.rentalNeeds ? errorId('rentalNeeds') : undefined}>
            <legend className="mb-1 text-label text-(--text-muted)">Co by ti nejvíc pomohlo (nepovinné)</legend>
            <div className="flex flex-col gap-(--touch-target-gap)">
              {RENTAL_NEEDS.map((need) => (
                <label key={need.value} className="flex min-h-(--touch-target-min) items-center gap-3 text-body text-(--text-main)">
                  <Checkbox
                    checked={rentalNeeds.includes(need.value)}
                    onChange={(e) => toggleRentalNeed(need.value, e.target.checked)}
                  />
                  <span>{need.label}</span>
                </label>
              ))}
            </div>
            {fieldError('rentalNeeds')}
          </fieldset>
        )}

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
