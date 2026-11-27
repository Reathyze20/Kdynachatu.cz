import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { InvitePage } from '@/features/invite/InvitePage'

// #525: pozvánka je ve stejném rámu jako ostatní veřejné obrazovky. Nadpis obrazovky je jediné h1,
// název appky nad ním zůstane jako text (AuthLayout s `title`).

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}))

type GetResult = ReturnType<typeof apiClient.get>

const validInvite = {
  valid: true,
  cabinName: 'Chata U Lesa',
  welcomeMessage: 'Těšíme se na tebe.',
  role: 'member',
  invitedBy: 'Jana',
  invitedByIcon: null,
}

function renderInvite() {
  render(
    <MemoryRouter initialEntries={['/invite/abc']}>
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/login" element={<div data-testid="login-route" />} />
      </Routes>
    </MemoryRouter>,
  )
}

function expectFramedWithTitle(title: string) {
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  const heading = screen.getByRole('heading', { level: 1, name: title })
  expect(heading.closest('.photo-backdrop')).not.toBeNull()
  expect(screen.getByText('Kdy na chatu').tagName).not.toMatch(/^H\d$/)
}

describe('pozvánka v rámu (#525)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('ověřování pozvánky je stav v rámu, ne spinner', () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => {}) as GetResult)
    renderInvite()
    expect(screen.getByRole('status')).toHaveTextContent('Ověřuji pozvánku…')
    expect(screen.getByRole('status').closest('.photo-backdrop')).not.toBeNull()
  })

  it('neplatná pozvánka: nadpis obrazovky jako jediné h1 a cesta na přihlášení', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { valid: false, message: 'Pozvánka vypršela.' } } as Awaited<GetResult>)
    renderInvite()

    await screen.findByText('Pozvánka vypršela.')
    expectFramedWithTitle('Neplatná pozvánka')
    expect(screen.getByRole('link', { name: 'Přejít na přihlášení' })).toHaveAttribute('href', '/login')
  })

  it('uvítání: nadpis jako h1, kdo zve, role a odkaz pro toho, kdo už účet má', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: validInvite } as Awaited<GetResult>)
    renderInvite()

    await screen.findByText('Chata U Lesa', { exact: false })
    expectFramedWithTitle('Pozvánka na chatu')
    expect(screen.getByText('Člen')).toBeInTheDocument()
    expect(screen.getByText('„Těšíme se na tebe.“')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pokračovat' }).className).toContain('min-h-(--touch-target-primary)')
    expect(screen.getByRole('link', { name: 'Přihlásit se' })).toHaveAttribute('href', '/login')
  })

  it('registrace: nadpis jako h1 a Zpět vrátí uvítání', async () => {
    const user = userEvent.setup()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: validInvite } as Awaited<GetResult>)
    renderInvite()

    await user.click(await screen.findByRole('button', { name: 'Pokračovat' }))
    expectFramedWithTitle('Vytvoř si účet')
    expect(screen.getByRole('button', { name: /Připojit se k chatě/ }).closest('.photo-backdrop')).not.toBeNull()

    const back = screen.getByRole('button', { name: 'Zpět' })
    expect(back.className).toContain('size-(--touch-target-min)')
    await user.click(back)
    expect(screen.getByRole('heading', { level: 1, name: 'Pozvánka na chatu' })).toBeInTheDocument()
  })
})
