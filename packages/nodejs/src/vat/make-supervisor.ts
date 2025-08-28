import { makeStreamTransport, Logger } from '@metamask/logger';
import type { VatId } from '@metamask/ocap-kernel';
import { VatSupervisor } from '@metamask/ocap-kernel';

import { fetchBlob } from './fetch-blob.ts';
import { makeStreams } from './streams.ts';

/**
 * Create a VatSupervisor for a vat running in a Node.js worker.
 *
 * @param vatId - The ID of the vat to create a supervisor for.
 * @param logTag - The tag to use for the logger.
 * @returns A pair of the kernel-connected logger and the supervisor.
 */
export async function makeNodeJsVatSupervisor(
  vatId: VatId,
  logTag: string,
): Promise<{ logger: Logger; supervisor: VatSupervisor }> {
  const { kernelStream, loggerStream } = await makeStreams();
  const logger = new Logger({
    tags: [logTag, vatId],
    transports: [makeStreamTransport(loggerStream)],
  });

  const supervisor = new VatSupervisor({
    id: vatId,
    kernelStream,
    logger,
    fetchBlob,
    vatPowers: { logger },
  });
  return { logger, supervisor };
}
