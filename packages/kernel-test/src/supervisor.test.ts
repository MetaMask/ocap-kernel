import '@ocap/shims/endoify';
import { VatSupervisor, VatCommandMethod } from '@ocap/kernel';
import type { VatCommand, VatConfig, VatCommandReply } from '@ocap/kernel';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

import { kser } from '../../kernel/src/kernel-marshal.ts';
import { TestDuplexStream } from '../../streams/test/stream-mocks.ts';

const makeVatSupervisor = async ({
  handleWrite = () => undefined,
  vatPowers,
}: {
  handleWrite?: (input: unknown) => void | Promise<void>;
  vatPowers?: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
}) => {
  const commandStream = await TestDuplexStream.make<
    VatCommand,
    VatCommandReply
  >(handleWrite);

  return {
    supervisor: new VatSupervisor({
      id: 'test-id',
      commandStream,
      vatPowers,
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      fetchBlob: async (url: string): Promise<Response> => {
        if (!url.endsWith('.bundle')) {
          throw new Error(`Unexpected URL: ${url}`);
        }
        const bundleName = url.split('/').pop() ?? url;
        const bundlePath = join(__dirname, bundleName);
        const bundleContent = await readFile(bundlePath, 'utf-8');
        return {
          ok: true,
          text: async () => bundleContent,
          json: async () => JSON.parse(bundleContent),
          // eslint-disable-next-line n/no-unsupported-features/node-builtins
        } as Response;
      },
    }),
    stream: commandStream,
  };
};

describe('VatSupervisor', () => {
  describe('initVat', () => {
    it('initializes vat with powers', async () => {
      let localValue: string | null = null;
      const vatPowers = {
        foo: async (value: string) => (localValue = value),
      };
      const { supervisor } = await makeVatSupervisor({ vatPowers });

      const vatConfig: VatConfig = {
        bundleSpec: new URL('powers-vat.bundle', import.meta.url).toString(),
        parameters: { bar: 'baz' },
      };

      await supervisor.handleMessage({
        id: 'test-id',
        payload: {
          method: VatCommandMethod.initVat,
          params: {
            vatConfig,
            state: new Map<string, string>(),
          },
        },
      });

      await supervisor.handleMessage({
        id: 'test-id',
        payload: {
          method: VatCommandMethod.deliver,
          params: ['message', 'o+0', { methargs: kser(['bootstrap', []]) }],
        },
      });

      expect(localValue).toBe('baz');
    });
  });
});
