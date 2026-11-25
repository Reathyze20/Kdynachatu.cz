import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Toast } from '@/components/shared/Toast'
import { showToast } from '@/lib/toast'
import { apiClient } from '@/api/client'
import { AuthPage } from '@/features/auth/AuthPage'
import { BookingForm } from '@/features/reservations/ui/BookingForm'

/**
 * #513: úspěch a info čtečka přečte zdvořile (`role="status"`), naléhavě jen chybu (`role="alert"`).
 * Toast jen potvrzuje výsledek akce větou s tečkou, bez vykřičníku a bez „úspěšně“ (DESIGN.md §8).
 */

vi.mock('@/lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/toast')>()
  return { ...actual, showToast: vi.fn(actual.showToast) }
})

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(), logout: vi.fn(), isAdmin: false, isSuperAdmin: false, token: null, user: null,
  }),
}))

describe('toast jako live region (#513)', () => {
  it.each([
    ['success', 'status', 'polite'],
    ['info', 'status', 'polite'],
    ['error', 'alert', 'assertive'],
  ] as const)('%s toast má role="%s" a aria-live="%s"', async (type, role, live) => {
    render(<Toast />)
    act(() => showToast('Rezervace uložena.', type))

    const toast = await screen.findByTestId('toast')
    expect(toast).toHaveAttribute('role', role)
    expect(toast).toHaveAttribute('aria-live', live)
  })
})

describe('po přihlášení se toast neukáže (#513)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(showToast).mockClear()
  })

  it('úspěšné přihlášení jen přejde dál, bez toastu', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { cabinSignupEnabled: true, accounts: [] } })
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { token: 't', username: 'jana', userId: 1, role: 'user', animalIcon: null, cabinId: 'c-1', isSuperAdmin: false },
    })
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><AuthPage /></MemoryRouter>
      </QueryClientProvider>,
    )

    await user.type(await screen.findByTestId('login-username-input'), 'jana')
    await user.type(screen.getByTestId('login-password-input'), 'heslo-1234')
    await user.click(screen.getByTestId('login-submit-button'))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/login', expect.anything()))
    expect(showToast).not.toHaveBeenCalled()
  })
})

describe('chyba formuláře je u formuláře, ne v toastu (#513)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(showToast).mockClear()
  })

  it('odjezd před příjezdem ukáže hlášku ve formuláři rezervace', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] })
    const post = vi.spyOn(apiClient, 'post')
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <BookingForm open onClose={vi.fn()} fromDate="2027-08-04" toDate="2027-08-02" existing={null} allReservations={[]} />
      </QueryClientProvider>,
    )

    // Formulář po otevření přesune fokus na příjezd; psát se dá až potom.
    await waitFor(() => expect(screen.getByLabelText('Příjezd')).toHaveFocus())
    await user.type(screen.getByLabelText('Účel návštěvy'), 'Víkend')
    await user.click(screen.getByRole('button', { name: 'Vytvořit rezervaci' }))

    // Chyba je pod polem, které ji způsobilo, a čtečka ji přečte s ním (DESIGN.md §7)
    const to = screen.getByLabelText('Odjezd')
    await waitFor(() => expect(to).toHaveAttribute('aria-invalid', 'true'))
    expect(to).toHaveAccessibleDescription('Datum odjezdu nesmí být před příjezdem.')
    expect(showToast).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})

const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../test/**', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** `showToast('text', 'success' | 'info')` s textem v jednom řetězci (bez interpolace). */
const CONFIRMATION_TOAST = /showToast\(\s*(["'])([^"'`$]+?)\1\s*,\s*["'](success|info)["']\s*\)/g

describe('texty potvrzujících toastů (#513, DESIGN.md §8)', () => {
  const toasts = Object.entries(SOURCES).flatMap(([file, src]) =>
    [...src.matchAll(CONFIRMATION_TOAST)].map((m) => ({ file, text: m[2] })),
  )

  it('glob najde potvrzující toasty', () => {
    expect(toasts.length).toBeGreaterThan(20)
  })

  it('každé potvrzení je věta s tečkou nebo výpustkou, bez vykřičníku a „úspěšně“', () => {
    const bad = toasts.filter(({ text }) =>
      !/[.…]$/.test(text) || text.includes('!') || /úspěšn/i.test(text),
    )
    expect(bad).toEqual([])
  })

  it('UI neříká „dashboard“', () => {
    const tsx = Object.entries(SOURCES).filter(([file]) => file.endsWith('.tsx'))
    const visible = tsx.flatMap(([file, src]) =>
      // Text mezi tagy a české věty v řetězcích (mezera + diakritika); cesta, třída ani komponenta UI text nejsou
      [...src.matchAll(/>([^<>{}]+)</g), ...src.matchAll(/(["'`])((?:(?!\1)[^\n])*)\1/g)]
        .map((m) => m[m.length - 1].trim())
        .filter((text) => /\s/.test(text) && /[á-žÁ-Ž]/.test(text) && /(?<![/\w-])dashboard(?![\w-])/i.test(text))
        .map((text) => `${file}: ${text}`),
    )
    expect(visible).toEqual([])
  })
})
