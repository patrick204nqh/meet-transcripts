import { beforeEach } from 'vitest'
import { makeChromeMock } from './chrome-mock'

beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = makeChromeMock()
})
