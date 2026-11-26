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
})
