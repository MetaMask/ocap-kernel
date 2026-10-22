import { makePromiseKit } from '@endo/promise-kit';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { delay } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { DuplexStream } from '@metamask/streams';
import { describe, it, expect, vi } from 'vitest';

import { VatHandle } from './VatHandle.ts';
import { VatSyscall } from './VatSyscall.ts';
import { Kernel } from '../Kernel.ts';
import { kser } from '../liveslots/kernel-marshal.ts';
import type {
  CrankResult,
  EndpointMessage,
  KRef,
  PlatformServices,
  VatConfig,
} from '../types.ts';

const sourceOf = (vatConfig: VatConfig): string | undefined =>
  'sourceSpec' in vatConfig ? vatConfig.sourceSpec : undefined;

describe('a subcluster with a peer vat that fails to launch', () => {
  it('is bootstrapped when a crank is open as it launches', async () => {
    const received: string[] = [];
    const released = makePromiseKit<void>();
    let openACrank = async (): Promise<void> => undefined;
    const logger = new Logger('test');
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(logger, level).mockImplementation(() => undefined);
    }
    vi.spyOn(logger, 'subLogger').mockReturnValue(logger);
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const platformServices = {
      launch: vi.fn().mockResolvedValue({
        end: vi.fn().mockResolvedValue(undefined),
      } as unknown as DuplexStream<JsonRpcMessage, JsonRpcMessage>),
      terminate: vi.fn().mockResolvedValue(undefined),
      terminateAll: vi.fn().mockResolvedValue(undefined),
      stopRemoteComms: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlatformServices;
    vi.spyOn(VatHandle, 'make').mockImplementation(
      async ({ vatId, vatConfig, kernelQueue, kernelStore }) => {
        if (sourceOf(vatConfig) === 'peer.js') {
          throw new Error('peer exploded');
        }
        if (sourceOf(vatConfig) === 'boot.js') {
          await openACrank();
        }
        const vatSyscall = new VatSyscall({ vatId, kernelQueue, kernelStore });
        return {
          vatId,
          config: vatConfig,
          deliverMessage: async (
            _target: string,
            message: EndpointMessage,
          ): Promise<CrankResult> => {
            const [method] = JSON.parse(message.methargs.body.slice(1));
            received.push(method);
            if (method === 'stall') {
              await released.promise;
            }
            if (message.result) {
              vatSyscall.handleSyscall([
                'resolve',
                [[message.result, false, kser('ready')]],
              ]);
            }
            return { didDelivery: vatId };
          },
          terminate: async (): Promise<void> => undefined,
          expectClose: (): void => undefined,
        } as unknown as VatHandle;
      },
    );
    const kernel = await Kernel.make(
      platformServices,
      await makeSQLKernelDatabase({ dbFilename: ':memory:' }),
      { logger },
    );
    const { vatRootKrefs } = await kernel.launchSubcluster({
      bootstrap: 'staller',
      vats: { staller: { sourceSpec: 'staller.js' } },
    });
    // Opened as the boot vat launches, after `launchSubcluster` has waited for
    // the open crank, and kept open while the launch asks for its bootstrap
    // write.
    openACrank = async () => {
      kernel
        .queueMessage(vatRootKrefs.staller as KRef, 'stall', [])
        .catch(() => undefined);
      await vi.waitFor(() => expect(received).toContain('stall'));
      delay(20)
        .then(() => released.resolve())
        .catch(() => undefined);
    };

    await expect(
      kernel.launchSubcluster({
        bootstrap: 'boot',
        vats: {
          boot: { sourceSpec: 'boot.js' },
          peer: { sourceSpec: 'peer.js' },
        },
      }),
    ).rejects.toThrow('(peer)');
    expect(received.filter((method) => method === 'bootstrap')).toHaveLength(2);
  });
});
