import { makeStreamTransport, Logger } from '@metamask/logger';
import type { VatId } from '@metamask/ocap-kernel';
import { VatSupervisor } from '@metamask/ocap-kernel';
import { makePlatform } from '@ocap/kernel-platforms/browser';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { isJsonRpcMessage } from '@metamask/kernel-utils';
import { MessagePortDuplexStream } from '@metamask/streams/browser';
import type { DuplexStream } from '@metamask/streams';

import { splitLoggerStream } from '@metamask/logger';

export async function makeCfWorkerVatSupervisor(
  vatId: VatId,
  logTag: string,
  port: MessagePort,
  platformOptions: Record<string, unknown> = {},
): Promise<{ logger: Logger; supervisor: VatSupervisor }> {
  const baseStream = await MessagePortDuplexStream.make<
    JsonRpcMessage,
    JsonRpcMessage
  >(port, isJsonRpcMessage);

  const { kernelStream, loggerStream } = splitLoggerStream(baseStream);

  const logger = new Logger({
    tags: [logTag, vatId],
    transports: [makeStreamTransport(loggerStream)],
  });

  const supervisor = new VatSupervisor({
    id: vatId,
    kernelStream,
    logger,
    makePlatform,
    platformOptions,
    // Cloudflare Workers provide fetch
    fetchBlob: async (bundleURL: string) => await fetch(bundleURL),
    vatPowers: { logger },
  });
  return { logger, supervisor };
}


