import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPage } from '@/features/legal/PrivacyPage'

describe('Ochrana soukromí', () => {
  // Uvedení zdroje se přesunulo z nápovědy výběru obce sem (#523, rozhodnutí uživatele); dřív v municipalityPicker.test.tsx.
  it('credits ČÚZK as the source of the list', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByText(/ČÚZK \(RÚIAN\), CC BY 4\.0/)).toBeInTheDocument()
  })

  // #696: zápis do waitlistu na landing page – co se sbírá, jak dlouho, jak smazat, jeden e-mail bez newsletteru.
  it('describes the waitlist without contradicting the no-marketing promise', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    const section = screen.getByRole('heading', { name: 'Seznam zájemců' }).closest('section')!
    expect(section).toHaveTextContent(/e-mail/)
    expect(section).toHaveTextContent(/24 měsíců/)
    expect(section).toHaveTextContent(/odpově/)
    expect(section).toHaveTextContent(/jeden potvrzovací e-mail/)
    expect(section).toHaveTextContent(/newsletter/)
    expect(screen.queryByText('Neposíláme reklamy, newslettery ani marketingové e-maily.')).not.toBeInTheDocument()
  })
})
