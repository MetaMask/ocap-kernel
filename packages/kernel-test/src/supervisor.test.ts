import '@ocap/shims/endoify';
import { describe, it, expect, vi } from 'vitest';
import { VatSupervisor, VatCommandMethod } from '@ocap/kernel';
import type { VatCommand, VatConfig, VatCommandReply } from '@ocap/kernel';
import { TestDuplexStream } from '../../streams/test/stream-mocks';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { kser } from '../../kernel/src/kernel-marshal';

const makeVatSupervisor = async ({
  handleWrite = () => undefined,
  vatPowers,
}: {
  handleWrite?: (input: unknown) => void | Promise<void>;
  vatPowers?: Record<string, unknown>;
}) => {
  const commandStream = await TestDuplexStream.make<VatCommand, VatCommandReply>(
    handleWrite,
  );

  return {
    supervisor: new VatSupervisor({
      id: 'test-id',
      commandStream,
      vatPowers,
      fetchBlob: async (url: string): Promise<Response> => {
        if (!url.endsWith('.bundle')) {
          throw new Error(`Unexpected URL: ${url}`);
        }
        const bundleName = url.split('/').pop();
        const bundlePath = join(__dirname, bundleName!);
        const bundleContent = await readFile(bundlePath, 'utf-8');
        return {
          ok: true,
          text: async () => bundleContent,
          json: async () => JSON.parse(bundleContent),
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
