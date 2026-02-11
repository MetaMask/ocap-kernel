import type { CapData } from '@endo/marshal';

import { parseOcapURL } from './remote-comms.ts';

/**
 * Minimal kernel interface needed for URL-based invocation.
 */
export type InvocationKernel = {
  redeemOcapURL: (url: string) => Promise<string>;
  queueMessage: (
    target: string,
    method: string,
    args: unknown[],
  ) => Promise<CapData<string>>;
  issueOcapURL: (kref: string) => Promise<string>;
};

/**
 * The result of an OCAP URL invocation, with krefs in capdata slots replaced
 * by OCAP URLs.
 */
export type InvocationResult = {
  body: string;
  slots: string[];
};

/**
 * Handle an OCAP URL invocation in a transport-agnostic way.
 *
 * 1. Parses the parameterized OCAP URL
 * 2. Redeems the URL to get the kernel reference
 * 3. Extracts method/args from query parameters
 * 4. Calls kernel.queueMessage with the resolved kref
 * 5. Replaces kref slots in the result with OCAP URLs
 *
 * @param ocapURL - The OCAP URL with method/args query parameters.
 * @param kernel - The kernel instance to invoke against.
 * @returns A JSON-serializable invocation result.
 */
export async function handleURLInvocation(
  ocapURL: string,
  kernel: InvocationKernel,
): Promise<InvocationResult> {
  const { oid, host, hints, method, args } = parseOcapURL(ocapURL);

  if (!method) {
    throw Error('invocation URL missing method parameter');
  }

  // Reconstruct the base URL without query params for redemption.
  // The kernel only understands bare OCAP URLs — method/args are an
  // invocation-layer concern.
  const baseURL = `ocap:${oid}@${[host, ...hints].join(',')}`;
  const kref = await kernel.redeemOcapURL(baseURL);
  const result = await kernel.queueMessage(kref, method, args ?? []);

  const urlSlots = await Promise.all(
    result.slots.map(async (slot) => kernel.issueOcapURL(slot)),
  );

  return {
    body: result.body,
    slots: urlSlots,
  };
}
