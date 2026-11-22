import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { MunicipalityOption } from '@/api/municipalities'
import { MunicipalityPicker } from '@/components/shared/MunicipalityPicker'

const TREBENICE: MunicipalityOption[] = [
  { code: 565768, name: 'Třebenice', district: 'Litoměřice', region: 'Ústecký kraj' },
  { code: 591866, name: 'Třebenice', district: 'Třebíč', region: 'Kraj Vysočina' },
]

function mockSearch(results: MunicipalityOption[]) {
  return vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { municipalities: results } })
}

function Harness({ initial = null, onChange = vi.fn() }: { initial?: MunicipalityOption | null; onChange?: (m: MunicipalityOption | null) => void }) {
  const [value, setValue] = useState<MunicipalityOption | null>(initial)
  return (
    <>
      <label htmlFor="obec">Nejbližší obec</label>
      <MunicipalityPicker
        id="obec"
        value={value}
        onChange={(m) => {
          setValue(m)
          onChange(m)
        }}
      />
      <output data-testid="picked">{value ? `${value.code}` : 'nic'}</output>
    </>
  )
}

function renderPicker(props: Parameters<typeof Harness>[0] = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>,
  )
}

describe('MunicipalityPicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('offers namesake municipalities with their district and picks the chosen one', async () => {
    const get = mockSearch(TREBENICE)
    renderPicker()

    await userEvent.type(screen.getByRole('combobox', { name: 'Nejbližší obec' }), 'Třebe')
    await userEvent.click(await screen.findByRole('option', { name: /Třebenice.*okres Třebíč/ }))

    expect(get).toHaveBeenCalledWith('/municipalities', { params: { q: 'Třebe' } })
    expect(screen.getByTestId('picked')).toHaveTextContent('591866')
    expect(screen.getByRole('combobox')).toHaveValue('Třebenice (okres Třebíč)')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('picks with the keyboard', async () => {
    mockSearch(TREBENICE)
    renderPicker()

    await userEvent.type(screen.getByRole('combobox'), 'Třebe')
    await screen.findAllByRole('option')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(screen.getByTestId('picked')).toHaveTextContent('591866')
  })

  it('typing after a pick drops the selection, so free text is never a value', async () => {
    mockSearch(TREBENICE)
    const onChange = vi.fn()
    renderPicker({ initial: TREBENICE[0], onChange })

    const input = screen.getByRole('combobox')
    expect(input).toHaveValue('Třebenice (okres Litoměřice)')
    await userEvent.type(input, 'x')

    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByTestId('picked')).toHaveTextContent('nic')
  })

  it('editing a pick searches by the name again, not by the shown district', async () => {
    const get = mockSearch(TREBENICE)
    renderPicker({ initial: TREBENICE[0] })

    await userEvent.type(screen.getByRole('combobox'), '{End}{Backspace}')

    expect(screen.getByRole('combobox')).toHaveValue('Třebenice')
    await waitFor(() => expect(get).toHaveBeenCalledWith('/municipalities', { params: { q: 'Třebenice' } }))
    expect(await screen.findAllByRole('option')).toHaveLength(2)
  })

  it('marks typed text without a pick as invalid', async () => {
    mockSearch(TREBENICE)
    renderPicker()
    const input = screen.getByRole('combobox')
    expect(input).toBeValid()

    await userEvent.type(input, 'Třebe')
    expect(input).toBeInvalid()

    await userEvent.click(await screen.findByRole('option', { name: /Litoměřice/ }))
    expect(input).toBeValid()
  })

  it('tells apart two namesakes in one district by their code', async () => {
    mockSearch([
      { code: 553841, name: 'Mezholezy', district: 'Domažlice', region: 'Plzeňský kraj' },
      { code: 553859, name: 'Mezholezy', district: 'Domažlice', region: 'Plzeňský kraj' },
    ])
    renderPicker()

    await userEvent.type(screen.getByRole('combobox'), 'Mezho')
    await userEvent.click(await screen.findByRole('option', { name: /kód obce 553859/ }))

    expect(screen.getByRole('combobox')).toHaveValue('Mezholezy (okres Domažlice, kód obce 553859)')
  })

  it('does not search before two characters', async () => {
    const get = mockSearch(TREBENICE)
    renderPicker()

    await userEvent.type(screen.getByRole('combobox'), 'T')

    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(get).not.toHaveBeenCalled()
  })

  it('says so when no municipality matches', async () => {
    mockSearch([])
    renderPicker()

    await userEvent.type(screen.getByRole('combobox'), 'Xyz')

    expect(await screen.findByText(/Žádná obec/)).toBeInTheDocument()
  })

  it('credits ČÚZK as the source of the list', () => {
    renderPicker()
    expect(screen.getByText(/ČÚZK/)).toBeInTheDocument()
  })

  it('keeps the listbox closed until results arrive', async () => {
    mockSearch(TREBENICE)
    renderPicker()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('combobox'), 'Tř')
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
  })
})
