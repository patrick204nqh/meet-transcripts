import { describe, it, expect } from 'vitest'
import { ExtensionError, ErrorCategory, ErrorCode } from './errors'

describe('ExtensionError', () => {
  it('is an instance of Error', () => {
    const e = new ExtensionError(ErrorCode.MEETING_NOT_FOUND, 'Meeting not found', 'MEETING')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(ExtensionError)
  })

  it('has the correct name', () => {
    const e = new ExtensionError(ErrorCode.NO_WEBHOOK_URL, 'No URL', 'NETWORK')
    expect(e.name).toBe('ExtensionError')
  })

  it('exposes code and category', () => {
    const e = new ExtensionError(ErrorCode.BLOB_READ_FAILED, 'Blob failed', 'STORAGE')
    expect(e.code).toBe(ErrorCode.BLOB_READ_FAILED)
    expect(e.category).toBe('STORAGE')
    expect(e.message).toBe('Blob failed')
  })

  it('ErrorCategory has all expected keys', () => {
    expect(ErrorCategory.STORAGE).toBe('STORAGE')
    expect(ErrorCategory.NETWORK).toBe('NETWORK')
    expect(ErrorCategory.MEETING).toBe('MEETING')
    expect(ErrorCategory.PERMISSION).toBe('PERMISSION')
    expect(ErrorCategory.UI).toBe('UI')
  })

  it('toErrorObject returns a serialisable envelope with code and message', () => {
    const e = new ExtensionError(ErrorCode.BLOB_READ_FAILED, 'Blob failed', 'STORAGE')
    expect(e.toErrorObject()).toEqual({ errorCode: ErrorCode.BLOB_READ_FAILED, errorMessage: 'Blob failed' })
  })

  it('toErrorObject survives JSON round-trip', () => {
    const e = new ExtensionError(ErrorCode.NO_WEBHOOK_URL, 'No URL', 'NETWORK')
    const rt = JSON.parse(JSON.stringify(e.toErrorObject()))
    expect(rt.errorCode).toBe(ErrorCode.NO_WEBHOOK_URL)
    expect(rt.errorMessage).toBe('No URL')
  })
})
