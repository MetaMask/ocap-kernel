/** Default maximum number of concurrent connections */
export const DEFAULT_MAX_CONCURRENT_CONNECTIONS = 100;

/** Default maximum message size in bytes (1MB) */
export const DEFAULT_MAX_MESSAGE_SIZE_BYTES = 1024 * 1024;

/** Default stale peer cleanup interval in milliseconds (15 minutes) */
export const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

/** Default stale peer timeout in milliseconds (1 hour) */
export const DEFAULT_STALE_PEER_TIMEOUT_MS = 60 * 60 * 1000;

/** Default message write timeout in milliseconds (10 seconds) */
export const DEFAULT_WRITE_TIMEOUT_MS = 10_000;

/** SCTP user initiated abort code (RFC 4960) */
export const SCTP_USER_INITIATED_ABORT = 12;
