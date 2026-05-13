import type { KernelApi } from './types.ts';

/**
 * Start the interactive TUI with the provided kernel API.
 *
 * @param options - Options for the TUI.
 * @param options.cwd - Current working directory for file browsing.
 * @param options.kernelApi - Pre-configured kernel API abstraction.
 */
export async function startTui({
  cwd,
  kernelApi,
}: {
  cwd: string;
  kernelApi: KernelApi;
}): Promise<void> {
  // Lazy-load ink and React to sidestep SES lockdown interaction at import time.
  const [{ render }, { createElement }] = await Promise.all([
    import('ink'),
    import('react'),
  ]);
  const { Tui } = await import('./tui.tsx');

  // Clear screen and move cursor to top-left before rendering to avoid
  // artifacts from prior terminal output.
  process.stdout.write('\x1B[2J\x1B[H');

  const instance = render(createElement(Tui, { cwd, kernelApi }));
  await instance.waitUntilExit();
}
