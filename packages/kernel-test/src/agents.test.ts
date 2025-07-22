import type { Kernel } from '@metamask/ocap-kernel';
import { kunser } from '@metamask/ocap-kernel';
import { makeKernel } from '@ocap/nodejs';
import { describe, it, expect, beforeEach } from 'vitest';

import { getBundleSpec } from './utils.ts';

describe('agents', () => {
  let kernel: Kernel;

  beforeEach(async () => {
    const { port2: port } = new MessageChannel();
    kernel = await makeKernel({ port });
  });

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
            bundleSpec: getBundleSpec('agents-user'),
            parameters: { name: 'Alice', prompt },
          },
        },
      });
      expect(result).toBeDefined();
      console.log('Result:', result);
      const llmResponse = kunser(result as Parameters<typeof kunser>[0]);
      expect(typeof llmResponse).toBe('string');
      expect(llmResponse).toMatch(/1[^0-9]*2[^0-9]*3[^0-9]*4[^0-9]*5/u);
    },
  );
});
