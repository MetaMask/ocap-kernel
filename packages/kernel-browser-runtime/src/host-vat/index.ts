/**
 * Host vat utilities for cross-process system vat communication.
 *
 * The host vat enables a system vat supervisor to run in a different process
 * than the kernel. The kernel runs in a Worker, and the supervisor runs in
 * the background script. They communicate over a stream using JSON-RPC messages
 * and the optimistic syscall model (fire-and-forget with ['ok', null]).
 */

export { makeKernelHostVat } from './kernel-side.ts';
export type { KernelHostVatResult } from './kernel-side.ts';

export { makeBackgroundHostVat } from './supervisor-side.ts';
export type { BackgroundHostVatResult } from './supervisor-side.ts';
