import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { MockedFunction } from 'vitest';

import cli from './cli';
import { commands } from './commands';

vi.mock('./cli');

describe('create-package/index', () => {
  let originalProcess: typeof globalThis.process;
  beforeEach(() => {
    originalProcess = globalThis.process;
    // TODO: Replace with `jest.replaceProperty` after Jest v29 update.
    globalThis.process = { ...globalThis.process };
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  it('executes the CLI application', async () => {
    const mock = cli as MockedFunction<typeof cli>;
    mock.mockRejectedValue('foo');

    vi.spyOn(console, 'error').mockImplementation(vi.fn());

    await import('.');
    await new Promise((resolve) => setImmediate(resolve));

    expect(cli).toHaveBeenCalledTimes(1);
    expect(cli).toHaveBeenCalledWith(process.argv, commands);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('foo');
    expect(process.exitCode).toBe(1);
  });
});
