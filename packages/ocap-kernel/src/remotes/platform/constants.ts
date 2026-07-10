/** SCTP user initiated abort code (RFC 4960) */
export const SCTP_USER_INITIATED_ABORT = 12;

/** Base delay for relay reconnection backoff in milliseconds (5 seconds) */
export const RELAY_RECONNECT_BASE_DELAY_MS = 5_000;

/** Maximum delay for relay reconnection backoff in milliseconds (60 seconds) */
export const RELAY_RECONNECT_MAX_DELAY_MS = 60_000;

/** Maximum number of relay reconnection attempts */
export const RELAY_RECONNECT_MAX_ATTEMPTS = 10;
