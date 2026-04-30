export const ErrorCode = {
  BLOB_READ_FAILED: "009",
  MEETING_NOT_FOUND: "010",
  WEBHOOK_REQUEST_FAILED: "011",
  NO_WEBHOOK_URL: "012",
  NO_MEETINGS: "013",
  EMPTY_TRANSCRIPT: "014",
  INVALID_INDEX: "015",
  NO_HOST_PERMISSION: "016",
  POPUP_OPEN_FAILED: "017",
  VERSION_MISMATCH: "018",
} as const

export type ErrorCodeValue = typeof ErrorCode[keyof typeof ErrorCode]

export const ErrorCategory = {
  STORAGE: "STORAGE",
  NETWORK: "NETWORK",
  MEETING: "MEETING",
  PERMISSION: "PERMISSION",
  UI: "UI",
} as const

export type ErrorCategoryValue = typeof ErrorCategory[keyof typeof ErrorCategory]

export class ExtensionError extends Error {
  constructor(
    public readonly code: ErrorCodeValue | string,
    message: string,
    public readonly category: ErrorCategoryValue,
  ) {
    super(message)
    this.name = "ExtensionError"
    // Fix prototype chain for instanceof in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype)
  }

  toErrorObject(): { errorCode: string; errorMessage: string } {
    return { errorCode: this.code, errorMessage: this.message }
  }
}
