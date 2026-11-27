import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { WaitlistForm, type WaitlistPrefill } from '@/features/landing/WaitlistForm'

// #699: dobrovolné otázky ve formuláři waitlistu. „Co by ti nejvíc pomohlo“ se ukáže jen při „Občas“ nebo „Ano“
// a při „Ne“ se vybrané potřeby neodešlou. Odeslání se zachytí na hranici API klienta (apiClient.post).

type PostResult = ReturnType<typeof apiClient.post>

const HOUSEHOLDS = 'Kolik domácností chatu sdílí (nepovinné)'
const WILLINGNESS = 'Kolik by ti stálo za to platit ročně (nepovinné)'
const PAIN_POINT = 'Co tě na sdílené chatě nejvíc štve (nepovinné)'
const RENTAL_INTENT = 'Pronajímáš (nebo chceš pronajímat) chatu cizím lidem (nepovinné)'
const RENTAL_NEEDS = 'Co by ti nejvíc pomohlo (nepovinné)'

function renderForm(prefill?: WaitlistPrefill) {
  const ui = (p?: WaitlistPrefill) => (
    <MemoryRouter>
      <WaitlistForm prefill={p} />
    </MemoryRouter>
  )
  const result = render(ui(prefill))
  return { ...result, rerenderWith: (p?: WaitlistPrefill) => result.rerender(ui(p)) }
}

function mockPost() {
  return vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { ok: true } } as Awaited<PostResult>)
}

function httpError(status: number, data: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data } })
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('E-mail'), 'jana@example.test')
  await user.selectOptions(screen.getByLabelText('Kdo jsi'), 'rodina')
  await user.click(screen.getByRole('checkbox', { name: /Souhlasím/ }))
}

const submit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Zapsat se' }))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('waitlist: dobrovolné otázky (#699)', () => {
  it('zápis projde jen s povinnými poli a dobrovolné odpovědi se neposílají', async () => {
    const post = mockPost()
    const user = userEvent.setup()
    renderForm()

    for (const label of [HOUSEHOLDS, WILLINGNESS, PAIN_POINT, RENTAL_INTENT]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    await fillRequired(user)
    await submit(user)

    const body = post.mock.calls[0][1] as Record<string, unknown>
    for (const key of ['households', 'willingnessToPay', 'painPoint', 'rentalIntent', 'rentalNeeds']) {
      expect(body).not.toHaveProperty(key)
    }
    expect(await screen.findByText(/Díky, jsi na seznamu/)).toBeInTheDocument()
  })

  it('„Co by ti nejvíc pomohlo“ se ukáže jen při „Občas“ nebo „Ano“', async () => {
    const user = userEvent.setup()
    renderForm()
    const intent = screen.getByLabelText(RENTAL_INTENT)

    expect(screen.queryByRole('group', { name: RENTAL_NEEDS })).not.toBeInTheDocument()
    await user.selectOptions(intent, 'obcas')
    expect(screen.getByRole('group', { name: RENTAL_NEEDS })).toBeInTheDocument()
    await user.selectOptions(intent, 'ne')
    expect(screen.queryByRole('group', { name: RENTAL_NEEDS })).not.toBeInTheDocument()
    await user.selectOptions(intent, 'ano')
    const needs = within(screen.getByRole('group', { name: RENTAL_NEEDS }))
    expect(needs.getAllByRole('checkbox')).toHaveLength(6)
    expect(needs.getByRole('checkbox', { name: 'Propojení s kalendářem Booking/Airbnb' })).toBeInTheDocument()
  })

  it('odešle všechny vyplněné dobrovolné odpovědi včetně potřeb pronájmu', async () => {
    const post = mockPost()
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.selectOptions(screen.getByLabelText(HOUSEHOLDS), '3-4')
    await user.selectOptions(screen.getByLabelText(WILLINGNESS), 'do-500')
    await user.type(screen.getByLabelText(PAIN_POINT), 'Nikdo neví, kdo má klíče.')
    await user.selectOptions(screen.getByLabelText(RENTAL_INTENT), 'ano')
    const needs = within(screen.getByRole('group', { name: RENTAL_NEEDS }))
    await user.click(needs.getByRole('checkbox', { name: 'Zálohy a platby' }))
    await user.click(needs.getByRole('checkbox', { name: 'Úklid a kontrola mezi hosty' }))
    await submit(user)

    expect(post).toHaveBeenCalledWith('/waitlist', expect.objectContaining({
      households: '3-4',
      willingnessToPay: 'do-500',
      painPoint: 'Nikdo neví, kdo má klíče.',
      rentalIntent: 'ano',
      rentalNeeds: ['zalohy-platby', 'uklid-mezi-hosty'],
    }))
  })

  it('po přepnutí na „Ne“ se vybrané potřeby neodešlou', async () => {
    const post = mockPost()
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.selectOptions(screen.getByLabelText(RENTAL_INTENT), 'obcas')
    await user.click(screen.getByRole('checkbox', { name: 'Zálohy a platby' }))
    await user.selectOptions(screen.getByLabelText(RENTAL_INTENT), 'ne')
    await submit(user)

    const body = post.mock.calls[0][1] as Record<string, unknown>
    expect(body.rentalIntent).toBe('ne')
    expect(body).not.toHaveProperty('rentalNeeds')
  })

  it('chybu dobrovolného pole ze serveru ukáže u pole, chybu potřeby u skupiny', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(httpError(400, {
      message: 'Chyba validace',
      errors: [
        { path: 'painPoint', message: 'Text může mít nejvýš 1000 znaků.' },
        { path: 'rentalNeeds.0', message: 'Vyber jen z nabízených možností.' },
      ],
    }))
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.selectOptions(screen.getByLabelText(RENTAL_INTENT), 'obcas')
    await submit(user)

    const painError = await screen.findByText('Text může mít nejvýš 1000 znaků.')
    const painPoint = screen.getByLabelText(PAIN_POINT)
    expect(painPoint).toHaveAttribute('aria-invalid', 'true')
    expect(painPoint).toHaveAttribute('aria-describedby', painError.id)
    const needsError = screen.getByText('Vyber jen z nabízených možností.')
    expect(screen.getByRole('group', { name: RENTAL_NEEDS })).toHaveAttribute('aria-describedby', needsError.id)
  })

  it('předvyplní segment a záměr pronájmu z prefill a novou výzvu použije i po vykreslení', async () => {
    const { rerenderWith } = renderForm({ segment: 'spolek' })
    expect(screen.getByLabelText('Kdo jsi')).toHaveValue('spolek')
    expect(screen.getByLabelText(RENTAL_INTENT)).toHaveValue('')

    rerenderWith({ rentalIntent: 'obcas' })
    expect(screen.getByLabelText(RENTAL_INTENT)).toHaveValue('obcas')
    expect(screen.getByLabelText('Kdo jsi')).toHaveValue('spolek')
    expect(screen.getByRole('group', { name: RENTAL_NEEDS })).toBeInTheDocument()
  })
})
