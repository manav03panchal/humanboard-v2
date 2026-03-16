import { describe, it, expect } from 'vitest'
import { isValidUrl, BrowserShapeUtil } from '../shapes/BrowserShapeUtil'

describe('isValidUrl', () => {
  it('accepts https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true)
    expect(isValidUrl('https://www.google.com/search?q=test')).toBe(true)
    expect(isValidUrl('https://localhost:3000')).toBe(true)
  })

  it('rejects http URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(false)
  })

  it('rejects file:// URLs', () => {
    expect(isValidUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects tauri:// URLs', () => {
    expect(isValidUrl('tauri://localhost')).toBe(false)
  })

  it('rejects javascript: URLs', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects invalid strings', () => {
    expect(isValidUrl('not-a-url')).toBe(false)
    expect(isValidUrl('')).toBe(false)
  })
})

describe('BrowserShapeUtil', () => {
  it('has correct type', () => {
    expect(BrowserShapeUtil.type).toBe('browser-shape')
  })

  it('returns correct default props', () => {
    const util = new BrowserShapeUtil({} as any)
    const defaults = util.getDefaultProps()
    expect(defaults).toEqual({ w: 800, h: 600, url: 'https://example.com' })
  })

  it('canEdit returns true', () => {
    const util = new BrowserShapeUtil({} as any)
    expect(util.canEdit({} as any)).toBe(true)
  })

  it('canResize returns true', () => {
    const util = new BrowserShapeUtil({} as any)
    expect(util.canResize({} as any)).toBe(true)
  })

  it('canRotate returns false', () => {
    const util = new BrowserShapeUtil({} as any)
    expect(util.canRotate()).toBe(false)
  })
})
