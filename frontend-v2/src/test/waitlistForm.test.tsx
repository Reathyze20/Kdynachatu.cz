import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiClient } from '@/api/client'
import { isQueueableRequest } from '@/lib/offlineQueue'
import { LandingPage } from '@/features/landing/LandingPage'

// #696: návštěvník landing page se zapíše do waitlistu formulářem v sekci #zapis. Odeslání se zachytí
// na hranici API klienta (apiClient.post).

type PostResult = ReturnType<typeof apiClient.post>

function renderLanding(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function httpError(status: number, data: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data } })
}

async function fillAndSubmit() {
  const user = userEvent.setup()
  const form = within(screen.getByTestId('waitlist-form'))
  await user.type(form.getByLabelText('E-mail'), 'jana@example.test')
  await user.selectOptions(form.getByLabelText('Kdo jsi'), 'spolek')
  await user.click(form.getByRole('checkbox', { name: /Souhlasím/ }))
  await user.click(form.getByRole('button', { name: 'Zapsat se' }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('landing page: zápis do waitlistu (#696)', () => {
  it('formulář je v sekci #zapis a souhlas říká, jak dlouho e-mail držíme', () => {
    const { container } = renderLanding()
    const section = container.querySelector('#zapis')
    expect(section).not.toBeNull()
    expect(within(section as HTMLElement).getByTestId('waitlist-form')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /24 měsíců/ })).not.toBeChecked()
  })

  it('odešle e-mail, segment, souhlas a ref z URL a ukáže poděkování místo formuláře', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { ok: true } } as Awaited<PostResult>)
    renderLanding('/?ref=fb-skupina')

    await fillAndSubmit()

    expect(post).toHaveBeenCalledWith('/waitlist', {
      email: 'jana@example.test',
      segment: 'spolek',
      consent: true,
      ref: 'fb-skupina',
      website: '',
    })
    expect(await screen.findByText(/Díky, jsi na seznamu/)).toBeInTheDocument()
    expect(screen.queryByTestId('waitlist-form')).not.toBeInTheDocument()
  })

  it('bez refu v URL posílá ref null', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { ok: true } } as Awaited<PostResult>)
    renderLanding('/')
    await fillAndSubmit()
    expect(post).toHaveBeenCalledWith('/waitlist', expect.objectContaining({ ref: null }))
  })

  it('chybu validace ze serveru ukáže u pole a pole označí', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      httpError(400, { message: 'Chyba validace', errors: [{ path: 'email', message: 'Zadej platný e-mail.' }] }),
    )
    renderLanding()
    await fillAndSubmit()

    const field = screen.getByLabelText('E-mail')
    const error = await screen.findByText('Zadej platný e-mail.')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field.getAttribute('aria-describedby')).toBe(error.id)
    expect(screen.getByTestId('waitlist-form')).toBeInTheDocument()
  })

  it('jinou chybu (rate limit) ukáže jako hlášku formuláře', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      httpError(429, { message: 'Z tohohle připojení přišlo moc zápisů. Zkus to za hodinu.' }),
    )
    renderLanding()
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Z tohohle připojení přišlo moc zápisů. Zkus to za hodinu.')
  })

  it('zápis offline nejde do fronty, návštěvník hned vidí chybu', () => {
    const config = { method: 'post', url: '/waitlist', headers: {} } as unknown as InternalAxiosRequestConfig
    expect(isQueueableRequest(config)).toBe(false)
  })
})
