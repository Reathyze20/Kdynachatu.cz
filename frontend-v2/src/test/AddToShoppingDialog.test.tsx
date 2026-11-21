import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import apiClient from '@/api/client'
import { shoppingApi, type ShoppingList } from '@/api/shopping'
import { AddToShoppingDialog } from '@/features/notes/AddToShoppingDialog'

vi.mock('@/lib/toast', () => ({
  showToast: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

const list: ShoppingList = {
  id: 'list-1',
  name: 'Víkend',
  createdById: 'user-1',
  isResolved: false,
  items: [
    { id: 'i-1', name: 'Chleba', status: 'pending', addedById: 'user-1', createdAt: '2027-01-01T00:00:00.000Z', isEssential: false },
    { id: 'i-2', name: 'Mléko', status: 'purchased', addedById: 'user-1', createdAt: '2027-01-01T00:00:00.000Z', isEssential: false },
  ],
}

describe('add-to-shopping dialog', () => {
  it('loads lists through the shopping API module and counts only pending items', async () => {
    const getLists = vi.spyOn(shoppingApi, 'getLists').mockResolvedValue([list])

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddToShoppingDialog open noteId="note-1" messageText="Koupit chleba" onClose={() => {}} />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('option', { name: 'Víkend (1 položek)' })).toBeTruthy()
    expect(getLists).toHaveBeenCalledTimes(1)
  })

  it('adds the item through the shopping API module and links it to the source message', async () => {
    vi.spyOn(shoppingApi, 'getLists').mockResolvedValue([list])
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} })
    vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: {} })
    const onClose = vi.fn()

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddToShoppingDialog open noteId="note-1" messageText="Koupit chleba" onClose={onClose} />
      </QueryClientProvider>,
    )

    await screen.findByRole('option', { name: 'Víkend (1 položek)' })
    fireEvent.click(screen.getByRole('button', { name: /Přidat/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith('/shopping-list/list-1/items', {
      name: 'Koupit chleba',
      isEssential: false,
      sourceMessageId: 'note-1',
    })
  })
})
