import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { Logger } from '@metamask/logger';
import type { LogEntry } from '@metamask/logger';
import type { Kernel } from '@metamask/ocap-kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  extractTestLogs,
  getBundleSpec,
  makeKernel,
  makeTestLogger,
} from './utils.ts';

describe('cluster initialization', { timeout: 4_000 }, () => {
  let logger: Logger;
  let entries: LogEntry[];
  let kernel: Kernel;

  type When = 'global' | 'build' | 'bootstrap';
  type What = 'throw' | 'uncaught-rejection';

  beforeEach(async () => {
    const testLogger = makeTestLogger();
    logger = testLogger.logger;
    entries = testLogger.entries;
    const database = await makeSQLKernelDatabase({});
    kernel = await makeKernel(
      database,
      true,
      logger.subLogger({ tags: ['test'] }),
    );
  });

  const launch = async (scenario: `${When}-${What}`) =>
    kernel.launchSubcluster({
      bootstrap: 'main',
      vats: {
        main: {
          bundleSpec: getBundleSpec(`error-${scenario}`),
          parameters: {},
        },
      },
    });

  it('throws if globals scope throws', async () => {
    await expect(launch('global-throw')).rejects.toThrow(/from global scope/u);

    const vatLogs = extractTestLogs(entries, 'console');
    expect(vatLogs).toStrictEqual(['global throw']);
  });

  it.todo('throws if global scope has an uncaught rejection', async () => {
    await expect(launch('global-uncaught-rejection')).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Subcluster initialization failed'),
        cause: expect.stringMatching(
          /[Uu]nknown(.)+uncaught promise rejection/u,
        ),
      }),
    );

    const vatLogs = extractTestLogs(entries, 'console');
    expect(vatLogs).toStrictEqual(['global uncaught rejection']);
  });

  it('throws if buildRootObject throws', async () => {
    await expect(launch('build-throw')).rejects.toThrow(
      /from buildRootObject/u,
    );

    const vatLogs = extractTestLogs(entries, 'console');
    expect(vatLogs).toStrictEqual(['build throw', 'buildRootObject']);
  });

  it.todo('throws if buildRootObject has an uncaught rejection', async () => {
    await expect(launch('build-uncaught-rejection')).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Subcluster initialization failed'),
        cause: expect.stringMatching(
          /[Uu]nknown(.)+uncaught promise rejection/u,
        ),
      }),
    );

    const vatLogs = extractTestLogs(entries, 'console');
    expect(vatLogs).toStrictEqual([
      'build uncaught rejection',
      'buildRootObject',
      'bootstrap',
    ]);
  });

  it('throws if bootstrap throws', async () => {
    await expect(launch('bootstrap-throw')).rejects.toThrow(/from bootstrap/u);

    const vatLogs = extractTestLogs(entries, 'console');
    expect(vatLogs).toStrictEqual([
      'bootstrap throw',
      'buildRootObject',
      'bootstrap',
    ]);
  });

  it.todo('throws if bootstrap has an uncaught rejection', async () => {
    await expect(launch('bootstrap-uncaught-rejection')).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Subcluster initialization failed'),
        cause: expect.stringMatching(
          /[Uu]nknown(.)+uncaught promise rejection/u,
        ),
      }),
    );

    const vatLogs = extractTestLogs(entries, 'console');
    expect(vatLogs).toStrictEqual([
      'bootstrap uncaught rejection',
      'buildRootObject',
      'bootstrap',
    ]);
  });
});
