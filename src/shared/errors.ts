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
} as const

export type ErrorCodeValue = typeof ErrorCode[keyof typeof ErrorCode]
