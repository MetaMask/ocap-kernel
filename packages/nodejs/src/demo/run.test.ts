import '@ocap/shims/endoify';

import type { VatConfig, VatId } from '@ocap/kernel';
import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';
import { describe, it, expect, vi } from 'vitest';

import { makeKernel } from '../kernel/make-kernel.js';

vi.mock('node:process', () => ({
  exit: vi.fn((reason) => {
    throw new Error(`process.exit: ${reason}`);
  }),
}));

describe('Kernel Worker', () => {
  const getTestVatConfig: VatConfig = (vatName: string) => ({
    bundleSpec: `http://localhost:3000/${vatName}.bundle`,
    parameters: { name: vatName },
  });

  it.each(['ollama-static', 'ollama-dynamic'])(
    'launches vat %j',
    async (vatName) => {
      const kernelPort = new NodeMessageChannel().port1;
      const kernel = await makeKernel(kernelPort);
      await kernel.clearStorage();
      const vatConfig = getTestVatConfig(vatName);

      await kernel.launchVat(vatConfig);

      const [vatId]: [VatId] = kernel.getVatIds();

      await kernel.sendVatCommand(vatId, {
        method: 'ping',
        params: null,
      });

      expect(true).toBe(true);
    },
  );
});
