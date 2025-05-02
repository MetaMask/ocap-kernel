// eslint-disable-next-line spaced-comment
/// <reference types="vite/client" />

import type { KernelDatabase } from '@metamask/kernel-store';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import type { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';
import { NodejsVatWorkerManager } from '@ocap/nodejs';
import {
  MessagePort as NodeMessagePort,
  MessageChannel as NodeMessageChannel,
} from 'node:worker_threads';

/**
 * Construct a bundle path URL from a bundle name.
 *
 * @param bundleName - The name of the bundle.
 *
 * @returns a path string for the named bundle.
 */
export function getBundleSpec(bundleName: string): string {
  return new URL(`./vats/${bundleName}.bundle`, import.meta.url).toString();
}

/**
 * Run the set of test vats.
 *
 * @param kernel - The kernel to run in.
 * @param config - Subcluster configuration telling what vats to run.
 *
 * @returns the bootstrap result.
 */
export async function runTestVats(
  kernel: Kernel,
  config: ClusterConfig,
): Promise<unknown> {
  const bootstrapResultRaw = await kernel.launchSubcluster(config);
  await waitUntilQuiescent();
  if (bootstrapResultRaw === undefined) {
    throw Error(`this can't happen but eslint is stupid`);
  }
  return kunser(bootstrapResultRaw);
}

/**
 * Send the `resume message to the root of one of the test vats.
 *
 * @param kernel - Our kernel.
 * @param rootRef - KRef of the object to which the message is sent.
 *
 * @returns the result returned from `resume`.
 */
export async function runResume(
  kernel: Kernel,
  rootRef: string,
): Promise<unknown> {
  const resumeResultRaw = await kernel.queueMessage(rootRef, 'resume', []);
  return kunser(resumeResultRaw);
}

/**
 * Handle all the boilerplate to set up a kernel instance.
 *
 * @param kernelDatabase - The database that will hold the persistent state.
 * @param resetStorage - If true, reset the database as part of setting up.
 *
 * @returns the new kernel instance.
 */
export async function makeKernel(
  kernelDatabase: KernelDatabase,
  resetStorage: boolean,
): Promise<Kernel> {
  const kernelPort: NodeMessagePort = new NodeMessageChannel().port1;
  const nodeStream = new NodeWorkerDuplexStream<
    JsonRpcRequest,
    JsonRpcResponse
  >(kernelPort);
  const vatWorkerClient = new NodejsVatWorkerManager({});
  const kernel = await Kernel.make(
    nodeStream,
    vatWorkerClient,
    kernelDatabase,
    {
      resetStorage,
    },
  );
  return kernel;
}

/**
 * De-interleave various vats' output to squeeze out interprocess I/O
 * non-determinism in CI.
 *
 * @param logs - An array of log lines.
 *
 * @returns `logs` sorted by vat.
 */
export function sortLogs(logs: string[]): string[] {
  logs.sort((a: string, b: string): number => {
    const colonA = a.indexOf(':');
    if (colonA < 0) {
      return 0;
    }
    const prefixA = a.substring(0, colonA);
    const colonB = b.indexOf(':');
    if (colonB < 0) {
      return 0;
    }
    const prefixB = b.substring(0, colonB);
    return prefixA.localeCompare(prefixB);
  });
  return logs;
}

/**
 * Convert a raw output buffer into a list of lines suitable for examination.
 *
 * @param buffer - The raw buffer to convert.
 *
 * @returns the relevant contents of `buffer`, massaged for use.
 */
export function extractVatLogs(buffer: string): string[] {
  const result = buffer
    .split('\n')
    .filter((line: string) => line.startsWith('::> '))
    .map((line: string) => line.slice(4));
  return sortLogs(result);
}

/**
 * Parse a message body into a JSON object.
 *
 * @param body - The message body to parse.
 *
 * @returns The parsed JSON object, or the original body if parsing fails.
 */
export function parseReplyBody(body: string): unknown {
  try {
    return JSON.parse(body.slice(1));
  } catch {
    return body;
  }
}

/**
 * Debug the database.
 *
 * @param kernelDatabase - The database to debug.
 */
export function logDatabase(kernelDatabase: KernelDatabase): void {
  const result = kernelDatabase.executeQuery('SELECT * FROM kv');
  console.log(result);
}
