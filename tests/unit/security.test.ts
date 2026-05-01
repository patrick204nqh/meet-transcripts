import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../extension')

const TELEMETRY_PATTERNS = [
  'script.google.com',
  'ejnana.github.io',
]

const SOURCE_FILES = [
  'background.js',
  'platforms/google-meet.js',
  'popup.js',
  'app.js',
]

describe('manifest', () => {
  let manifest: Record<string, unknown>

  beforeAll(() => {
    manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf-8'))
  })

  it('name is Meet Transcripts', () => {
    expect(manifest.name).toBe('Meet Transcripts')
  })

  it('declares only expected permissions', () => {
    const allowed = ['storage', 'downloads', 'scripting', 'notifications', 'activeTab']
    for (const perm of (manifest.permissions as string[]) ?? []) {
      expect(allowed, `unexpected permission declared: ${perm}`).toContain(perm)
    }
  })

  it('host_permissions are scoped to expected domains', () => {
    const allowed = ['https://meet.google.com/*']
    for (const perm of (manifest.host_permissions as string[]) ?? []) {
      expect(allowed, `unexpected host_permission: ${perm}`).toContain(perm)
    }
  })

  it('optional_host_permissions contain no Zoom or Teams domains', () => {
    const forbidden = ['zoom.us', 'teams.live.com', 'teams.microsoft.com']
    for (const perm of (manifest.optional_host_permissions as string[]) ?? []) {
      for (const domain of forbidden) {
        expect(perm, `optional_host_permissions must not include ${domain}`).not.toContain(domain)
      }
    }
  })

  it('has no declarative_net_request block', () => {
    expect(manifest.declarative_net_request).toBeUndefined()
  })
})

describe('extension source', () => {
  it('contains no upstream telemetry endpoints', () => {
    for (const file of SOURCE_FILES) {
      const content = fs.readFileSync(path.join(extensionPath, file), 'utf-8')
      for (const pattern of TELEMETRY_PATTERNS) {
        expect(content, `${file} must not contain telemetry endpoint: ${pattern}`).not.toContain(pattern)
      }
    }
  })
})
