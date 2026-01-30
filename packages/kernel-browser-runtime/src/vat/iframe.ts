import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { isJsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { VatSupervisor } from '@metamask/ocap-kernel';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
} from '@metamask/streams/browser';
import { makePlatform } from '@ocap/kernel-platforms/browser';

import { stringifyConsoleArg } from '../utils/console-forwarding.ts';

const logger = new Logger('vat-iframe');

/**
 * Sets up console forwarding from a vat iframe to the parent window (offscreen).
 * Uses postMessage instead of streams since the iframe doesn't have a direct
 * stream connection to offscreen.
 *
 * @param vatId - The vat identifier to use as the source.
 */
function setupIframeConsoleForwarding(vatId: string): void {
  const originalConsole = { ...console };
  const consoleMethods = ['log', 'debug', 'info', 'warn', 'error'] as const;

  consoleMethods.forEach((consoleMethod) => {
    // eslint-disable-next-line no-console
    console[consoleMethod] = (...args: unknown[]) => {
      originalConsole[consoleMethod](...args);

      // Post to parent (offscreen document)
      window.parent.postMessage(
        {
          type: 'console-forward',
          source: `vat-${vatId}`,
          method: consoleMethod,
          args: args.map(stringifyConsoleArg),
        },
        '*',
      );
    };
  });

  harden(globalThis.console);
}

main().catch(logger.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const kernelStream = await receiveMessagePort(
    (listener) => addEventListener('message', listener),
    (listener) => removeEventListener('message', listener),
  ).then(async (port) =>
    MessagePortDuplexStream.make<JsonRpcMessage, JsonRpcMessage>(
      port,
      isJsonRpcMessage,
    ),
  );

  const urlParams = new URLSearchParams(window.location.search);
  const vatId = urlParams.get('vatId') ?? 'unknown';

  // Set up console forwarding to parent (offscreen) for Playwright capture
  setupIframeConsoleForwarding(vatId);

  // eslint-disable-next-line no-new
  new VatSupervisor({
    id: vatId,
    kernelStream,
    logger: logger.subLogger(vatId),
    makePlatform,
  });

  logger.info('VatSupervisor initialized with vatId:', vatId);
}
