import { makeDefaultExo } from '@metamask/kernel-utils';
import { makeChannel } from '@metamask/kernel-utils/session';
import type { Channel } from '@metamask/kernel-utils/session';
import type { Kernel } from '@metamask/ocap-kernel';

type KernelDeps = Pick<Kernel, 'registerKernelServiceObject' | 'issueOcapURL'>;

/**
 * The remotable facet of a channel factory — only exposes what vats need
 * to call via CapTP. `getChannelByUrl` is kept as a plain closure because
 * it returns a non-passable `Channel` object (plain harden'd record with
 * function-valued properties), which would fail Endo's passability guard
 * if placed on an exo method.
 */
export type ChannelFactory = {
  createChannel(): Promise<string>;
};

export type ChannelFactoryBundle = {
  channelFactory: ChannelFactory;
  getChannelByUrl: (url: string) => Channel | undefined;
  /** Create a channel directly (bypassing the exo), returning both the URL and the Channel object. */
  createChannelInternal: () => Promise<{ ocapUrl: string; channel: Channel }>;
};

/**
 * Create a channel factory exo and a companion lookup function.
 *
 * The exo is registered as a kernel service so vats can call `createChannel`.
 * The returned `getChannelByUrl` closure is passed directly to the stream
 * socket server, bypassing exo passability checks.
 *
 * @param kernel - Kernel dependency for registering services and issuing URLs.
 * @returns A bundle containing the exo and the lookup function.
 */
export function makeChannelFactory(kernel: KernelDeps): ChannelFactoryBundle {
  let channelCount = 0;
  const channels = new Map<string, Channel>();

  /**
   * @returns The OCAP URL and the created channel.
   */
  async function createChannelInternal(): Promise<{
    ocapUrl: string;
    channel: Channel;
  }> {
    const channelName = `channel:${channelCount}`;
    channelCount += 1;
    const channel = makeChannel();
    const service = kernel.registerKernelServiceObject(channelName, channel);
    const ocapUrl = await kernel.issueOcapURL(service.kref);
    channels.set(ocapUrl, channel);
    return { ocapUrl, channel };
  }

  const channelFactory = makeDefaultExo('ChannelFactory', {
    async createChannel(): Promise<string> {
      const { ocapUrl } = await createChannelInternal();
      return ocapUrl;
    },
  });

  const getChannelByUrl = (url: string): Channel | undefined =>
    channels.get(url);

  return { channelFactory, getChannelByUrl, createChannelInternal };
}
