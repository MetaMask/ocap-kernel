import type {
  PresenceManager,
  KernelFacade,
} from '@metamask/kernel-browser-runtime';

// Type declarations for kernel dev console API.
declare global {
  /**
   * The E() function from @endo/eventual-send for making eventual sends.
   * Set globally in the trusted prelude before lockdown.
   *
   * @example
   * ```typescript
   * const kernel = await kernel.getKernel();
   * const status = await E(kernel).getStatus();
   * ```
   */
  // eslint-disable-next-line no-var,id-length
  var E: typeof import('@endo/eventual-send').E;

  // eslint-disable-next-line no-var
  var kernel: KernelFacade | Promise<KernelFacade>;

  /**
   * CapTP utilities for resolving krefs to E()-callable presences.
   *
   * @example
   * ```typescript
   * const alice = captp.resolveKref('ko1');
   * await E(alice).hello('console');
   * ```
   */
  // eslint-disable-next-line no-var
  var captp: PresenceManager;
}

export {};
