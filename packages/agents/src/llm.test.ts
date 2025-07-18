import '@ocap/test-utils/mock-endoify';
import { consoleTransport, Logger } from '@metamask/logger';
import { kunser } from '@metamask/ocap-kernel';
import type { Kernel } from '@metamask/ocap-kernel';
import { makeKernel } from '@ocap/nodejs';
import { expect, describe, it, beforeEach, vi } from 'vitest';

import { makeLlm } from './llm.ts';
import { getBundleSpec } from './vats/index.ts';

const logger = new Logger({
  tags: ['test'],
  transports: [consoleTransport],
});

const mocks = vi.hoisted(() => ({
  Ollama: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({
      [Symbol.asyncIterator]: vi.fn(),
    }),
    chat: vi.fn().mockResolvedValue({
      [Symbol.asyncIterator]: vi.fn(),
    }),
  })),
  makeFarGenerator: vi.fn(),
}));

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

  vi.mock('ollama/browser', () => ({
    Ollama: mocks.Ollama,
  }));

  vi.mock('@metamask/streams/vat', () => ({
    makeFarGenerator: mocks.makeFarGenerator,
  }));

  describe('makeLlm', () => {
    it('should return an object with generate and chat methods', async () => {
      const llm = await makeLlm();
      expect(llm).toHaveProperty('generate');
      expect(llm).toHaveProperty('chat');
    });

    it('should pass config to Ollama', async () => {
      const config = { host: 'http://test' };
      await makeLlm(config);
      // check that the Ollama constructor was called with the correct config
      expect(mocks.Ollama).toHaveBeenCalledOnce();
      expect(mocks.Ollama.mock.calls?.[0]).toMatchObject([config]);
    });

    it.each(['generate', 'chat'])(
      'should promise a FarGenerator from its %s method',
      async (method) => {
        const llm = await makeLlm();
        // @ts-expect-error The underlying ollama library is mocked in these tests
        const result = await llm[method as keyof typeof llm]();
        expect(mocks.makeFarGenerator).toHaveBeenCalledOnce();
        expect(mocks.makeFarGenerator.mock.calls?.[0]).toMatchObject([result]);
      },
    );
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
