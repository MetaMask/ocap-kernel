import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Transport } from './types.ts';

/**
 * Creates a file transport that appends timestamped log lines to a file.
 * Parent directories are created automatically. Tags are included in the
 * file output for structured log analysis.
 *
 * This transport requires Node.js (`node:fs/promises`).
 *
 * @param filePath - Absolute path to the log file.
 * @returns A transport function that appends to the file.
 */
export function makeFileTransport(filePath: string): Transport {
  return (entry) => {
    const tags = entry.tags.length > 0 ? `[${entry.tags.join(', ')}] ` : '';
    const parts = [
      ...(entry.message ? [entry.message] : []),
      ...(entry.data ?? []),
    ];
    const line = `${new Date().toISOString()} [${entry.level}] ${tags}${parts.join(' ')}\n`;
    mkdir(dirname(filePath), { recursive: true })
      .then(async () => appendFile(filePath, line))
      .catch(() => undefined);
  };
}
