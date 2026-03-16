import { describe, expect, it } from 'vitest'

import { getErrorMessage } from './getErrorMessage'

describe('getErrorMessage', () => {
  it('returns the error message for Error instances', () => {
    expect(getErrorMessage(new Error('Problem'))).toBe('Problem')
  })

  it('returns the fallback for non-Error values', () => {
    expect(getErrorMessage('not-an-error', 'Fallback')).toBe('Fallback')
  })
})
