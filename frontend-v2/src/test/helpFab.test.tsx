import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelpDialog } from '@/components/shared/HelpDialog'
import { HELP_PAGES } from '@/components/shared/helpContent'
import { PRIMARY_NAV, MORE_NAV } from '@/lib/navRoutes'

async function openHelpAt(entry: string) {
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <HelpDialog isOpen onClose={() => {}} />
    </MemoryRouter>,
  )
  const modal = await screen.findByRole('dialog', { name: 'Nápověda k této stránce' })
  const dialog = modal.querySelector<HTMLElement>('#help-modal-content')!
  return { dialog, unmount: view.unmount }
}

describe('HelpDialog – nápověda podle položky navigace (#510)', () => {
  it.each([...PRIMARY_NAV, ...MORE_NAV].map((item) => [item.label, item.to]))(
    'položka „%s“ má vlastní nápovědu se stejným názvem',
    async (label, to) => {
      const { dialog } = await openHelpAt(to)
      expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent(label)
    },
  )

  it('Předávka a Kalendář ukazují různý obsah', async () => {
    const calendar = await openHelpAt('/reservations')
    const calendarText = calendar.dialog.textContent
    calendar.unmount()

    const handover = await openHelpAt('/reservations?sekce=predavka')
    expect(handover.dialog).toHaveTextContent(/stav chaty při odjezdu/i)
    expect(handover.dialog.textContent).not.toBe(calendarText)
  })

  it('správa má vlastní nápovědu i mimo hlavní navigaci', async () => {
    const { dialog } = await openHelpAt('/admin/invites')
    expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent('Pozvánky')
  })

  it('texty nepoužívají žargon staré aplikace', () => {
    const banned = /dashboard|widget|lightbox|snapshot|request id|support workflow|odjezdový protokol|\.\.\./i
    for (const [key, content] of Object.entries(HELP_PAGES)) {
      const { container, unmount } = render(<>{content}</>)
      expect(container.textContent, key).not.toMatch(banned)
      unmount()
    }
  })
})
