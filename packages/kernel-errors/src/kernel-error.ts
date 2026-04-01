/**
 * Error codes for expected kernel errors that vat code may handle gracefully.
 */
export type ExpectedKernelErrorCode =
  | 'OBJECT_REVOKED'
  | 'OBJECT_DELETED'
  | 'BAD_PROMISE_RESOLUTION'
  | 'ENDPOINT_UNREACHABLE'
  | 'CONNECTION_LOST'
  | 'PEER_RESTARTED'
  | 'VAT_TERMINATED'
  | 'DELIVERY_FAILED';

/**
 * Error codes for fatal kernel errors (kernel bugs or illegal operations).
 * These are prefixed with `VAT_FATAL:` in the error message.
 */
export type FatalKernelErrorCode = 'ILLEGAL_SYSCALL' | 'INTERNAL_ERROR';

/**
 * All kernel error codes.
 */
export type KernelErrorCode = ExpectedKernelErrorCode | FatalKernelErrorCode;

/**
 * Pattern matching kernel error messages.
 * Matches both `[KERNEL:<CODE>]` and `[KERNEL:VAT_FATAL:<CODE>]`.
 */
export const KERNEL_ERROR_PATTERN = /^\[KERNEL:(?:(VAT_FATAL):)?([A-Z_]+)\]/u;

/**
 * Check whether a value is a kernel error (an Error whose message starts with
 * `[KERNEL:...]`).
 *
 * @param value - The value to check.
 * @returns `true` if `value` is an Error with a kernel error message.
 */
export function isKernelError(value: unknown): value is Error {
  return value instanceof Error && KERNEL_ERROR_PATTERN.test(value.message);
}

/**
 * Extract the kernel error code from an Error, if present.
 *
 * @param error - The error to inspect.
 * @returns The kernel error code, or `undefined` if the error is not a kernel error.
 */
export function getKernelErrorCode(error: Error): KernelErrorCode | undefined {
  const match = KERNEL_ERROR_PATTERN.exec(error.message);
  if (!match) {
    return undefined;
  }
  return match[2] as KernelErrorCode;
}

/**
 * Check whether an Error is a fatal kernel error (its message contains the
 * `VAT_FATAL:` infix).
 *
 * @param error - The error to inspect.
 * @returns `true` if the error is a fatal kernel error.
 */
export function isFatalKernelError(error: Error): boolean {
  const match = KERNEL_ERROR_PATTERN.exec(error.message);
  return match !== null && match[1] === 'VAT_FATAL';
}
