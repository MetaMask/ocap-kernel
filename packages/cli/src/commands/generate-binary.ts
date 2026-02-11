import type { Logger } from '@metamask/logger';
import { chmod, writeFile } from 'node:fs/promises';

/**
 * Configuration for generating a compiled binary.
 */
type GenerateBinaryConfig = {
  ocapURL: string;
  endpointURL: string;
  name: string;
};

/**
 * Generate source code for a self-contained console binary.
 *
 * The generated script embeds an OCAP URL and HTTP endpoint, parses CLI
 * arguments, constructs an invocation URL, POSTs it to the kernel, and prints
 * the result.
 *
 * @param config - The binary generation configuration.
 * @param config.ocapURL - The OCAP URL for the console vat root object.
 * @param config.endpointURL - The HTTP endpoint URL for the kernel invocation server.
 * @param config.name - The binary name (used in usage messages).
 * @returns The generated script source code.
 */
export function generateBinarySource(config: GenerateBinaryConfig): string {
  const { ocapURL, endpointURL, name } = config;
  return `#!/usr/bin/env node
'use strict';

const OCAP_URL = ${JSON.stringify(ocapURL)};
const ENDPOINT_URL = ${JSON.stringify(endpointURL)};
const NAME = ${JSON.stringify(name)};

const [command, ...args] = process.argv.slice(2);

if (!command) {
  process.stderr.write(\`Usage: \${NAME} <command> [...args]\\n\`);
  process.exit(1);
}

const url = new URL(OCAP_URL);
url.searchParams.set('method', command);
url.searchParams.set('args', JSON.stringify(args));

const body = JSON.stringify({ url: url.toString() });

const { request } = ENDPOINT_URL.startsWith('https')
  ? require('node:https')
  : require('node:http');

const req = request(
  ENDPOINT_URL,
  { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      try {
        const parsed = JSON.parse(raw);
        if (parsed.error) {
          process.stderr.write(\`Error: \${parsed.error}\\n\`);
          process.exit(1);
        }
        process.stdout.write(JSON.stringify(parsed, null, 2) + '\\n');
      } catch {
        process.stdout.write(raw + '\\n');
      }
    });
  },
);

req.on('error', (problem) => {
  process.stderr.write(\`Connection error: \${problem.message}\\n\`);
  process.exit(1);
});

req.write(body);
req.end();
`;
}

/**
 * Generate a compiled binary and write it to disk.
 *
 * @param options - The compile options.
 * @param options.name - The name/path for the output binary.
 * @param options.ocapURL - The OCAP URL for the console vat root object.
 * @param options.endpointURL - The HTTP endpoint URL for the kernel invocation server.
 * @param options.logger - Logger instance.
 */
export async function handleCompile(options: {
  name: string;
  ocapURL: string;
  endpointURL: string;
  logger: Logger;
}): Promise<void> {
  const { name, ocapURL, endpointURL, logger } = options;
  const source = generateBinarySource({ ocapURL, endpointURL, name });
  await writeFile(name, source, 'utf-8');
  await chmod(name, 0o755);
  logger.info(`Wrote binary: ${name}`);
}
