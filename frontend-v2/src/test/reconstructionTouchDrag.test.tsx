/**
 * #502 – na dotyku se stránka Rekonstrukce posouvá tahem i po kartě, přesun mezi sloupci je záměrná akce
 * (dlouhý stisk nebo změna kategorie v úpravě). Myší se přetahuje jako dřív.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DndContext } from '@dnd-kit/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecItem } from '@/api/reconstruction'
import { KanbanColumn } from '@/features/reconstruction/KanbanColumn'
import { TaskFormModal } from '@/features/reconstruction/TaskFormModal'
import { TOUCH_DRAG_DELAY_MS, useReconstructionSensors } from '@/features/reconstruction/dndSensors'

vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

const IDEA: RecItem = {
  id: 'idea-1',
  category: 'idea',
  title: 'Nová terasa',
  description: null,
  cost: 12000,
  votes: [],
  createdAt: '2026-04-18T10:00:00.000Z',
}

function Board({ onDragStart }: { onDragStart: () => void }) {
  const sensors = useReconstructionSensors()
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart}>
      <KanbanColumn category="idea" items={[IDEA]} currentUserId="user-1" onAdd={vi.fn()} onEdit={vi.fn()} />
    </DndContext>
  )
}

function renderBoard() {
  const onDragStart = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <Board onDragStart={onDragStart} />
    </QueryClientProvider>,
  )
  const handle = screen.getByText('Nová terasa').closest('[aria-roledescription="draggable"]') as HTMLElement
  return { onDragStart, handle }
}

function touch(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] }
}

describe('reconstruction board on touch devices (#502)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    // dnd-kit removes its post-drag click guard on a timer; flush it so it cannot swallow clicks in later tests.
    act(() => {
      vi.runOnlyPendingTimers()
    })
    vi.useRealTimers()
  })

  it('lets the browser scroll over a card instead of blocking touch gestures', () => {
    const { handle } = renderBoard()
    expect(handle.style.touchAction).not.toBe('none')
  })

  it('does not start a drag when a finger swipes over a card', () => {
    const { onDragStart, handle } = renderBoard()

    fireEvent.touchStart(handle, touch(100, 100))
    fireEvent.touchMove(handle, touch(100, 40))
    act(() => {
      vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS + 100)
    })
    fireEvent.touchEnd(handle, touch(100, 40))

    expect(onDragStart).not.toHaveBeenCalled()
  })

  it('starts a drag after a long press', () => {
    const { onDragStart, handle } = renderBoard()

    fireEvent.touchStart(handle, touch(100, 100))
    act(() => {
      vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS + 50)
    })
    fireEvent.touchEnd(handle, touch(100, 100))

    expect(onDragStart).toHaveBeenCalledTimes(1)
  })

  it('keeps mouse dragging on desktop', () => {
    const { onDragStart, handle } = renderBoard()

    fireEvent.mouseDown(handle, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.mouseMove(document, { clientX: 130, clientY: 100 })
    fireEvent.mouseUp(document, { button: 0, clientX: 130, clientY: 100 })

    expect(onDragStart).toHaveBeenCalledTimes(1)
  })
})

describe('changing the category without dragging (#502)', () => {
  it('lets the edit dialog move a card to another column', () => {
    const onSubmit = vi.fn()
    render(<TaskFormModal initialCategory="idea" editItem={IDEA} onClose={vi.fn()} onSubmit={onSubmit} />)

    const taskTab = screen.getAllByTestId('reconstruction-category-tab').find((tab) => tab.dataset.category === 'task')
    expect(taskTab).toBeDefined()
    fireEvent.click(taskTab!)
    fireEvent.click(screen.getByTestId('reconstruction-submit-button'))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: 'task', title: 'Nová terasa', cost: 12000 }))
  })

  it('keeps the link when an idea becomes a company', () => {
    const onSubmit = vi.fn()
    const idea = { ...IDEA, link: 'https://example.cz/terasa' }
    render(<TaskFormModal initialCategory="idea" editItem={idea} onClose={vi.fn()} onSubmit={onSubmit} />)

    const companyTab = screen.getAllByTestId('reconstruction-category-tab').find((tab) => tab.dataset.category === 'company')
    fireEvent.click(companyTab!)
    fireEvent.click(screen.getByTestId('reconstruction-submit-button'))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: 'company', link: 'https://example.cz/terasa' }))
  })
})
