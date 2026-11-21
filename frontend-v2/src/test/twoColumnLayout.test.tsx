import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TwoColumnLayout } from '@/components/layout/TwoColumnLayout'

describe('TwoColumnLayout — dvousloupcové rozložení rámu #1b (#171)', () => {
  it('bez obsahu bočního panelu vykreslí jen hlavní sloupec, boční panel se nevykreslí', () => {
    render(
      <TwoColumnLayout>
        <p>Hlavní obsah</p>
      </TwoColumnLayout>,
    )
    expect(screen.getByText('Hlavní obsah')).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.getByTestId('two-column-layout')).not.toHaveClass('two-column-layout--with-aside')
  })

  it('prázdný slot (null) se chová stejně jako žádný slot', () => {
    render(<TwoColumnLayout aside={null}><p>Hlavní obsah</p></TwoColumnLayout>)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.getByTestId('two-column-layout')).not.toHaveClass('two-column-layout--with-aside')
  })

  it('s obsahem bočního panelu vykreslí hlavní sloupec a za ním pojmenovaný boční panel', () => {
    render(
      <TwoColumnLayout aside={<p>Další příjezd</p>} asideLabel="Souvislosti">
        <p>Hlavní obsah</p>
      </TwoColumnLayout>,
    )
    const aside = screen.getByRole('complementary', { name: 'Souvislosti' })
    expect(aside).toHaveTextContent('Další příjezd')
    expect(screen.getByTestId('two-column-layout')).toHaveClass('two-column-layout--with-aside')

    // Na mobilu se sloupce skládají pod sebe v pořadí DOM: hlavní napřed, boční panel pod ním.
    const main = screen.getByText('Hlavní obsah')
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
