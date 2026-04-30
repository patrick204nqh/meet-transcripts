const PREFIX = "[meet-transcripts]"
const IS_DEV = typeof __DEV__ !== "undefined" && (__DEV__ as boolean)

export const log = {
  debug: (...a: unknown[]): void => { if (IS_DEV) console.debug(PREFIX, ...a) },
  info:  (...a: unknown[]): void => { console.info(PREFIX, ...a) },
  warn:  (...a: unknown[]): void => { console.warn(PREFIX, ...a) },
  error: (...a: unknown[]): void => { console.error(PREFIX, ...a) },
}
