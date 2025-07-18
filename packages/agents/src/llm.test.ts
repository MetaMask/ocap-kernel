import '@ocap/test-utils/mock-endoify';
import { consoleTransport, Logger } from '@metamask/logger';
import { kunser } from '@metamask/ocap-kernel';
import type { Kernel } from '@metamask/ocap-kernel';
import { makeKernel } from '@ocap/nodejs';
import { expect, describe, it, beforeEach } from 'vitest';

import { getBundleSpec } from './vats/index.ts';

const logger = new Logger({
  tags: ['test'],
  transports: [consoleTransport],
});

describe('llm', () => {
  let kernel: Kernel;
  beforeEach(async () => {
    const { port2: port } = new MessageChannel();
    kernel = await makeKernel({
      port,
      dbFilename: ':memory:',
      logger,
    });
  });

  // Only run in development mode
  // eslint-disable-next-line n/no-process-env
  describe.runIf(process.env.NODE_ENV === 'development')('integration', () => {
    it(
      'should be able to generate text',
      {
        timeout: 5_000,
      },
      async () => {
        console.log('Starting test');
        const prompt = 'Count to 6. Do not use any words.';
        const result = await kernel.launchSubcluster({
          bootstrap: 'user',
          vats: {
            user: {
              bundleSpec: getBundleSpec('user'),
              parameters: { name: 'Alice', prompt },
            },
            ollama: {
              bundleSpec: getBundleSpec('ollama'),
            },
          },
        });
        expect(result).toBeDefined();
        const llmResponse = kunser(result as Parameters<typeof kunser>[0]);
        expect(typeof llmResponse).toBe('string');
        expect(llmResponse).toMatch(/1[^0-9]*2[^0-9]*3[^0-9]*4[^0-9]*5/u);
      },
    );
  });
});
