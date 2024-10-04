import './kernel-worker-trusted-prelude.js';
import type { KernelCommand, KernelCommandReply, VatId } from '@ocap/kernel';
import { isKernelCommand, Kernel, KernelCommandMethod } from '@ocap/kernel';
import { PostMessageDuplexStream } from '@ocap/streams';
import { makeLogger, stringify } from '@ocap/utils';

import { makeKernelStore } from './sqlite-kernel-store.js';
import { ExtensionVatWorkerClient } from './VatWorkerClient.js';

type MainArgs = { defaultVatId: VatId };

const logger = makeLogger('[kernel worker]');

main({ defaultVatId: 'v0' }).catch(console.error);

/**
 * The main function for the offscreen script.
 *
 * @param options - The options bag.
 * @param options.defaultVatId - The id to give the default vat.
 */
async function main({ defaultVatId }: MainArgs): Promise<void> {
  const start = performance.now();

  const kernelStream = new PostMessageDuplexStream<
    KernelCommand,
    KernelCommandReply
  >(
    (message) => globalThis.postMessage(message),
    (listener) => globalThis.addEventListener('message', listener),
    (listener) => globalThis.removeEventListener('message', listener),
  );

  // Initialize vat worker service.

  const vatWorkerClient = new ExtensionVatWorkerClient(
    (message: unknown) => globalThis.postMessage(message),
    (listener) => {
      globalThis.onmessage = listener;
    },
  );

  // Initialize kernel store.

  const kernelStore = await makeKernelStore();

  // Create kernel.

  const kernel = new Kernel(vatWorkerClient, kernelStore);
  const iframeReadyP = kernel.launchVat({ id: defaultVatId });

  await reply({
    method: KernelCommandMethod.InitKernel,
    params: { defaultVat: defaultVatId, initTime: performance.now() - start },
  });

  // Handle messages from the console service worker
  for await (const message of kernelStream) {
    if (isKernelCommand(message)) {
      await handleKernelCommand(message);
    } else {
      logger.debug(`Received unexpected message ${stringify(message)}`);
    }
  }

  /**
   * Handle a KernelCommand sent from the offscreen.
   *
   * @param command - The KernelCommand to handle.
   * @param command.method - The command method.
   * @param command.params - The command params.
   */
  async function handleKernelCommand({
    method,
    params,
  }: KernelCommand): Promise<void> {
    switch (method) {
      case KernelCommandMethod.InitKernel:
        throw new Error('The kernel starts itself.');
      case KernelCommandMethod.Ping:
        await reply({ method, params: 'pong' });
        break;
      case KernelCommandMethod.Evaluate:
        await handleVatTestCommand({ method, params });
        break;
      case KernelCommandMethod.CapTpCall:
        await handleVatTestCommand({ method, params });
        break;
      case KernelCommandMethod.KVSet:
        kernel.kvSet(params.key, params.value);
        await reply({
          method,
          params: `~~~ set "${params.key}" to "${params.value}" ~~~`,
        });
        break;
      case KernelCommandMethod.KVGet: {
        try {
          const result = kernel.kvGet(params);
          await reply({
            method,
            params: result,
          });
        } catch (problem) {
          // TODO: marshal
          await reply({
            method,
            params: String(asError(problem)),
          });
        }
        break;
      }
      default:
        console.error(
          'kernel worker received unexpected command',
          // @ts-expect-error Runtime does not respect "never".
          { method: method.valueOf(), params },
        );
    }
  }

  /**
   * Handle a command implemented by the test vat.
   *
   * @param command - The command to handle.
   */
  async function handleVatTestCommand(
    command: Extract<
      KernelCommand,
      | { method: typeof KernelCommandMethod.Evaluate }
      | { method: typeof KernelCommandMethod.CapTpCall }
    >,
  ): Promise<void> {
    const { method, params } = command;
    const vat = await iframeReadyP;
    switch (method) {
      case KernelCommandMethod.Evaluate:
        await reply({
          method,
          params: await evaluate(vat.id, params),
        });
        break;
      case KernelCommandMethod.CapTpCall:
        await reply({
          method,
          params: stringify(await vat.callCapTp(params)),
        });
        break;
      default:
        console.error(
          'Offscreen received unexpected vat command',
          // @ts-expect-error Runtime does not respect "never".
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          { method: method.valueOf(), params },
        );
    }
  }

  /**
   * Reply to the background script.
   *
   * @param payload - The payload to reply with.
   */
  async function reply(payload: KernelCommandReply): Promise<void> {
    await kernelStream.write(payload);
  }

  /**
   * Evaluate a string in the default iframe.
   *
   * @param vatId - The ID of the vat to send the message to.
   * @param source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  async function evaluate(vatId: VatId, source: string): Promise<string> {
    try {
      const result = await kernel.sendMessage(vatId, {
        method: KernelCommandMethod.Evaluate,
        params: source,
      });
      return String(result);
    } catch (error) {
      if (error instanceof Error) {
        return `Error: ${error.message}`;
      }
      return `Error: Unknown error during evaluation.`;
    }
  }

  /**
   * Coerce an unknown problem into an Error object.
   *
   * @param problem - Whatever was caught.
   * @returns The problem if it is an Error, or a new Error with the problem as the cause.
   */
  function asError(problem: unknown): Error {
    return problem instanceof Error
      ? problem
      : new Error('Unknown', { cause: problem });
  }
}
