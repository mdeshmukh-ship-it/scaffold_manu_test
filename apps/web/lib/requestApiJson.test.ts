import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestApiJson, RequestApiJsonError } from './requestApiJson'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('requestApiJson', () => {
  it('requests safe backend api paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(requestApiJson<{ ok: boolean }>('/api/auth/start')).resolves.toEqual({
      ok: true,
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/start', {
      method: 'GET',
      credentials: 'include',
      headers: undefined,
      body: undefined,
    })
  })

  it('rejects absolute urls before calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      requestApiJson('https://internal.example.test/api/auth/start')
    ).rejects.toThrow(
      'requestApiJson only accepts same-origin backend API paths like /api/auth/start.'
    )

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects path traversal outside the api prefix', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(requestApiJson('/api/../admin')).rejects.toThrow(
      'requestApiJson only accepts same-origin backend API paths like /api/auth/start.'
    )

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('raises a typed error for non-2xx api responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Forbidden' } }),
      })
    )

    await expect(requestApiJson('/api/auth/start')).rejects.toEqual(
      expect.objectContaining<RequestApiJsonError>({
        message: 'Forbidden',
        name: 'RequestApiJsonError',
        status: 403,
      })
    )
  })
})
