export interface IBrowserStorage {
  localGet(keys: string[]): Promise<Record<string, unknown>>
  localSet(data: Record<string, unknown>): Promise<void>
  syncGet(keys: string[]): Promise<Record<string, unknown>>
  syncSet(data: Record<string, unknown>): Promise<void>
}

export interface IBrowserRuntime {
  readonly id: string
  sendMessage(msg: unknown): Promise<unknown>
  onMessage(
    handler: (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void
  ): void
}
