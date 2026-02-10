import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { formatTagPrefix } from './tags.ts';
import type { Transport } from './types.ts';

type FileTransportOptions = {
  filePath: string;
  tags?: boolean;
};

/**
 * Creates a file transport that appends timestamped log lines to a file.
 * Parent directories are created automatically.
 *
 * This transport requires Node.js (`node:fs/promises`).
 *
 * @param options - Options for the file transport.
 * @param options.filePath - Absolute path to the log file.
 * @param options.tags - Whether to include tags in the output (default: `true`).
 * @returns A transport function that appends to the file.
 */
export function makeFileTransport(options: FileTransportOptions): Transport {
  const { filePath, tags = true } = options;
  return (entry) => {
    const tagPrefix = formatTagPrefix(tags, entry);
    const parts = [
      ...(entry.message ? [entry.message] : []),
      ...(entry.data ?? []),
    ];
    const line = `${new Date().toISOString()} [${entry.level}] ${tagPrefix}${parts.join(' ')}\n`;
    mkdir(dirname(filePath), { recursive: true })
      .then(async () => appendFile(filePath, line))
      .catch(() => undefined);
  };
}
