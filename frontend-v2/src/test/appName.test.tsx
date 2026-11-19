import { describe, it, expect, vi } from 'vitest'
import { render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginForm } from '@/features/auth/LoginForm'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}))

describe('app name „Kdy na chatu“', () => {
  it('login screen shows the app name', () => {
    render(
      <MemoryRouter>
        <LoginForm onShowForgotPassword={vi.fn()} onShowRegister={vi.fn()} onShowVerify={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Kdy na chatu' })).toBeInTheDocument()
  })

  it('browser tab title ends with the app name', () => {
    renderHook(() => useDocumentTitle('Rezervace'))
    expect(document.title).toBe('Rezervace | Kdy na chatu')
  })
})
