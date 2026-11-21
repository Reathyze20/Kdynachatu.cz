import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import apiClient from '@/api/client'
import { ShoppingWidget } from '@/features/dashboard/ShoppingWidget'

vi.mock('@/lib/toast', () => ({
  showToast: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dashboard shopping widget', () => {
  it('checking an item marks it purchased through the item status endpoint', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: {} })
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ShoppingWidget
            items={[{ id: 'item-1', name: 'Chleba', listId: 'list-1', listName: 'Víkend', isEssential: false }]}
            totalCount={1}
            totalItemsCount={2}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('checkbox'))

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/shopping-list/item-1/purchase', { status: 'purchased' })
    })
    expect(screen.queryByText('Chleba')).toBeNull()
  })
})
