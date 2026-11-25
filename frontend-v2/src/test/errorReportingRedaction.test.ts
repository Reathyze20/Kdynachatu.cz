/**
 * Hlášení chyb z klienta nesmí poslat do serverových logů tokeny z URL (#481):
 * reset hesla, ověření e-mailu a pozvánky do chaty.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { api } = vi.hoisted(() => ({ api: { post: vi.fn() } }))
vi.mock('@/api/client', () => ({ default: api }))

import { reportError } from '@/lib/errorReporting'
import { rememberApiCorrelation } from '@/lib/observability'

const SECRET = 'S3cr3tT0k3n'

function sentPayload() {
  expect(api.post).toHaveBeenCalledTimes(1)
  return api.post.mock.calls[0][1] as { url: string; path: string; context: { lastApi?: { url?: string } } }
}

describe('reportError – tokeny z URL (#481)', () => {
  beforeEach(() => {
    api.post.mockReset().mockResolvedValue({})
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('chyba na stránce resetu hesla odešle URL bez hodnoty tokenu', () => {
    window.history.replaceState({}, '', `/reset-password?token=${SECRET}`)

    reportError({ message: 'boom' }, false)

    const { url, path } = sentPayload()
    expect(JSON.stringify(api.post.mock.calls[0])).not.toContain(SECRET)
    expect(url).toBe(`${window.location.origin}/reset-password?token=redacted`)
    expect(path).toBe('/reset-password')
  })

  it('odstraní všechny citlivé parametry a nechá ostatní beze změny', () => {
    window.history.replaceState(
      {},
      '',
      `/verify?Token=${SECRET}&code=${SECRET}&reset=${SECRET}&verify=${SECRET}&access_token=${SECRET}&tab=kalendar`,
    )

    reportError({ message: 'boom' })

    const { url } = sentPayload()
    expect(url).not.toContain(SECRET)
    expect(url).toBe(
      `${window.location.origin}/verify?Token=redacted&code=redacted&reset=redacted&verify=redacted&access_token=redacted&tab=kalendar`,
    )
  })

  it('pozná i složené názvy parametrů (camelCase, víc předpon)', () => {
    window.history.replaceState({}, '', `/x?resetToken=${SECRET}&apiKey=${SECRET}&password_reset_token=${SECRET}&page=2`)

    reportError({ message: 'boom' })

    expect(sentPayload().url).toBe(
      `${window.location.origin}/x?resetToken=redacted&apiKey=redacted&password_reset_token=redacted&page=2`,
    )
  })

  it('URL s tokenem uvnitř textu chyby odejde bez tokenu', () => {
    reportError({ message: `Failed to load ${window.location.origin}/verify?token=${SECRET} and /invite/${SECRET}` })

    expect(api.post.mock.calls[0][1].message).toBe(
      `Failed to load ${window.location.origin}/verify?token=redacted and /invite/redacted`,
    )
  })

  it('odstraní token i z fragmentu za #', () => {
    window.history.replaceState({}, '', `/verify#token=${SECRET}`)

    reportError({ message: 'boom' })

    expect(sentPayload().url).toBe(`${window.location.origin}/verify#token=redacted`)
  })

  it('token pozvánky v cestě /invite/:token nahradí v URL i v path', () => {
    window.history.replaceState({}, '', `/invite/${SECRET}`)

    reportError({ message: 'boom', path: window.location.pathname }, false)

    const { url, path } = sentPayload()
    expect(url).toBe(`${window.location.origin}/invite/redacted`)
    expect(path).toBe('/invite/redacted')
  })

  it('URL a path předané volajícím projdou stejným čištěním', () => {
    reportError({
      message: 'boom',
      url: `https://kdynachatu.cz/reset-password?token=${SECRET}`,
      path: `/invite/${SECRET}`,
    })

    const { url, path } = sentPayload()
    expect(url).toBe('https://kdynachatu.cz/reset-password?token=redacted')
    expect(path).toBe('/invite/redacted')
  })

  it('URL posledního API volání (validace pozvánky) odejde bez tokenu', () => {
    rememberApiCorrelation({ status: 410, method: 'GET', url: `/invites/validate/${SECRET}` })

    reportError({ message: 'boom' })

    expect(sentPayload().context.lastApi?.url).toBe('/invites/validate/redacted')
    expect(JSON.stringify(api.post.mock.calls[0])).not.toContain(SECRET)
  })
})
