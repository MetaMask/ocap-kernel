import '@ocap/shims/endoify';
import { delay } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { VatConfig } from '@metamask/ocap-kernel';
import { VatSupervisor, kser } from '@metamask/ocap-kernel';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

import { getBundleSpec } from './utils.ts';
import { TestDuplexStream } from '../../streams/test/stream-mocks.ts';

const makeVatSupervisor = async ({
  dispatch = () => undefined,
  vatPowers,
}: {
  dispatch?: (input: unknown) => void | Promise<void>;
  vatPowers?: Record<string, unknown>;
}) => {
  const kernelStream = await TestDuplexStream.make<
    JsonRpcMessage,
    JsonRpcMessage
  >(dispatch);

  return {
    supervisor: new VatSupervisor({
      id: 'test-id',
      kernelStream,
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
    stream: kernelStream,
  };
};

describe('VatSupervisor', () => {
  describe('initVat', () => {
    it('initializes vat with powers', async () => {
      let localValue: string | null = null;
      const vatPowers = {
        foo: async (value: string) => (localValue = value),
      };
      const { stream } = await makeVatSupervisor({
        vatPowers,
      });

      const vatConfig: VatConfig = {
        bundleSpec: getBundleSpec('powers-vat'),
        parameters: { bar: 'buzz' },
      };

      await stream.receiveInput({
        id: 'test-id-1',
        method: 'initVat',
        params: {
          vatConfig,
          state: [],
        },
        jsonrpc: '2.0',
      });

      await stream.receiveInput({
        id: 'test-id-2',
        method: 'deliver',
        params: [
          'message',
          'o+0',
          { methargs: kser(['fizz', []]), result: null },
        ],
        jsonrpc: '2.0',
      });
      await delay(100);

      expect(localValue).toBe('buzz');
    });
  });
});
