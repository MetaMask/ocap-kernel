import '@ocap/shims/endoify';
import type { VatCommand, VatConfig, VatCommandReply } from '@ocap/kernel';
import { VatSupervisor, VatCommandMethod, kser } from '@ocap/kernel';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

import { getBundleSpec } from './utils.ts';
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
        const bundlePath = join(__dirname, 'vats', bundleName);
        const bundleContent = await readFile(bundlePath, 'utf-8');
        return {
          ok: true,
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
        bundleSpec: getBundleSpec('powers-vat'),
        parameters: { bar: 'buzz' },
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
          params: ['message', 'o+0', { methargs: kser(['fizz', []]) }],
        },
      });

      expect(localValue).toBe('buzz');
    });
  });
});
