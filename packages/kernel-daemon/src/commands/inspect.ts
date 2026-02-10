import type { Logger } from '@metamask/logger';

import { connectToDaemon } from '../daemon-client.ts';
import type { GetMethodSpecs } from './types.ts';

type CapDataResult = { body: string; slots: string[] };

/**
 * Parse a smallcaps-encoded capdata body into a plain value.
 *
 * @param body - The smallcaps-encoded body string (prefixed with `#`).
 * @returns The parsed value.
 */
function parseCapDataBody(body: string): unknown {
  return JSON.parse(body.slice(1));
}

/**
 * Handle the `kernel daemon inspect <kref>` command.
 * Queries a kernel object for its method names, interface guard, and schema.
 *
 * @param kref - The kernel reference to inspect.
 * @param getMethodSpecs - Async getter for RPC method specifications.
 * @param logger - Logger for output.
 */
export async function handleInspect(
  kref: string,
  getMethodSpecs: GetMethodSpecs,
  logger: Logger,
): Promise<void> {
  const methodSpecs = await getMethodSpecs();
  const { client, close } = await connectToDaemon(methodSpecs, logger);

  try {
    const namesResult = (await client.call('queueMessage', [
      kref,
      '__getMethodNames__',
      [],
    ] as never)) as CapDataResult;
    const methodNames = parseCapDataBody(namesResult.body) as string[];

    const result: Record<string, unknown> = { methodNames };

    if (methodNames.includes('__getInterfaceGuard__')) {
      const guardResult = (await client.call('queueMessage', [
        kref,
        '__getInterfaceGuard__',
        [],
      ] as never)) as CapDataResult;
      result.interfaceGuard = parseCapDataBody(guardResult.body);
    }

    if (methodNames.includes('describe')) {
      const schemaResult = (await client.call('queueMessage', [
        kref,
        'describe',
        [],
      ] as never)) as CapDataResult;
      result.schema = parseCapDataBody(schemaResult.body);
    }

    logger.info(JSON.stringify(result, null, 2));
  } finally {
    close();
  }
}
