/**
 * #521 – tabule Rekonstrukce podle DESIGN.md: nápady podle hlasů, hlasování říká, co udělá,
 * úpravy v kebab menu (ne jen při najetí myší) a mazání až po potvrzení.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DndContext } from '@dnd-kit/core'
import { describe, expect, it, vi } from 'vitest'
import { reconstructionApi, type RecItem } from '@/api/reconstruction'
import { KanbanColumn } from '@/features/reconstruction/KanbanColumn'
import { useReconstructionSensors } from '@/features/reconstruction/dndSensors'

vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

const idea = (id: string, votes: string[]): RecItem => ({
  id, category: 'idea', title: `Nápad ${id}`, description: null, votes, createdAt: '2026-04-18T10:00:00.000Z',
})

function Board({ items }: { items: RecItem[] }) {
  return (
    <DndContext sensors={useReconstructionSensors()}>
      <KanbanColumn category="idea" items={items} currentUserId="user-1" onAdd={vi.fn()} onEdit={vi.fn()} />
    </DndContext>
  )
}

function renderBoard(items: RecItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><Board items={items} /></QueryClientProvider>)
}

describe('tabule Rekonstrukce podle DESIGN.md (#521)', () => {
  it('řadí nápady podle počtu hlasů, nejvíc hlasů nahoře', () => {
    renderBoard([idea('a', []), idea('b', ['u1', 'u2', 'u3']), idea('c', ['u1'])])
    expect(screen.getAllByTestId('reconstruction-item-card').map((card) => card.dataset.itemId)).toEqual(['b', 'c', 'a'])
  })

  it('hlasovací tlačítko říká, co udělá, a počet hlasů stojí zvlášť', () => {
    renderBoard([idea('a', ['user-1', 'u2']), idea('b', ['u2'])])
    const [voted, notVoted] = screen.getAllByTestId('reconstruction-item-card')
    expect(within(voted).getByRole('button', { name: 'Beru hlas zpět' })).toBeInTheDocument()
    expect(within(voted).getByText('2 hlasy')).toBeInTheDocument()
    expect(within(notVoted).getByRole('button', { name: 'Chci to' })).toBeInTheDocument()
    expect(within(notVoted).getByText('1 hlas')).toBeInTheDocument()
  })

  it('Upravit a Smazat jsou v kebab menu a Smazat se nejdřív zeptá', async () => {
    const remove = vi.spyOn(reconstructionApi, 'delete')
    renderBoard([idea('a', [])])
    expect(screen.queryByRole('button', { name: /upravit|smazat/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Akce s položkou Nápad a' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Upravit', 'Smazat'])
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Smazat' }))

    expect(await screen.findByRole('dialog', { name: 'Smazat položku' })).toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()
  })
})
