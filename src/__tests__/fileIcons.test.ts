import { describe, it, expect } from 'vitest'
import { getFileIcon } from '../lib/fileIcons'

describe('getFileIcon', () => {
  it('returns folder icon for directories', () => {
    const Icon = getFileIcon('src', true)
    expect(Icon).toBeDefined()
    expect(Icon.displayName).toBe('ZedIcon')
  })

  it('returns different icon for open vs closed folder', () => {
    const closed = getFileIcon('src', true, false)
    const open = getFileIcon('src', true, true)
    expect(closed).not.toBe(open)
  })

  it('returns language-specific icon for known extensions', () => {
    const tsIcon = getFileIcon('app.ts', false)
    const goIcon = getFileIcon('main.go', false)
    const defaultIcon = getFileIcon('random.xyz', false)
    // Each should be a distinct component
    expect(tsIcon).not.toBe(defaultIcon)
    expect(goIcon).not.toBe(defaultIcon)
    expect(tsIcon).not.toBe(goIcon)
  })

  it('returns icon for known filenames', () => {
    const dockerIcon = getFileIcon('Dockerfile', false)
    const defaultIcon = getFileIcon('random.xyz', false)
    expect(dockerIcon).not.toBe(defaultIcon)
  })

  it('returns default file icon for unknown extensions', () => {
    const icon = getFileIcon('foo.unknown', false)
    expect(icon).toBeDefined()
  })
})
