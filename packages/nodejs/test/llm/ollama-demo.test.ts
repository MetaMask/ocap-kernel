import '@ocap/shims/endoify';

import { Kernel } from '@ocap/kernel';
import type { VatConfig } from '@ocap/kernel';
import {
  MessageChannel as NodeMessageChannel,
  MessagePort as NodePort,
} from 'node:worker_threads';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { makeKernel } from '../../src/kernel/make-kernel.js';

vi.mock('node:process', () => ({
  exit: vi.fn((reason) => {
    throw new Error(`process.exit: ${reason}`);
  }),
}));

describe('Ollama Cluster', () => {
  let kernelPort: NodePort;
  let kernel: Kernel;

  const model = 'deepseek-r1:1.5b';
  const ollamaVatConfig: VatConfig = {
    bundleSpec: 'http://localhost:3000/ollama.bundle',
    parameters: {
      model,
      prompt: [
        `You are an instance of LLM model ${model}.`,
        'A user has asked you to give an introduction.',
        'Say hello and show what you can do!',
      ].join(' '),
    },
  };

  beforeEach(async () => {
    if (kernelPort) {
      kernelPort.close();
    }
    kernelPort = new NodeMessageChannel().port1;
    kernel = await makeKernel(kernelPort);
  });

  afterEach(async () => {
    if (kernel) {
      await kernel.terminateAllVats();
      await kernel.clearStorage();
    }
  });

  it('hosts an LLM', async () => {
    await kernel.launchSubcluster({
      bootstrap: 'ollama',
      vats: {
        ollama: ollamaVatConfig,
      },
    });
    const [vatId] = kernel.getVatIds();
    console.log('vatId', vatId);
    await kernel.sendVatCommand(vatId, {
      method: 'ping',
      params: null,
    });
    expect(true).toBe(true);
  }, 30_000);
});
