import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { isJsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { VatSupervisor } from '@metamask/ocap-kernel';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
} from '@metamask/streams/browser';
import { makeMlcLlmProvider } from '@ocap/agents/llm-provider/web-llm';

import { makeCaches } from './cache-polyfill.ts';
import webLlmConfigs from './web-llm-configs.ts';

const logger = new Logger('vat-iframe');

main().catch(logger.error);

Object.defineProperty(globalThis, 'caches', {
  value: makeCaches(webLlmConfigs),
});

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

  const llamaTinyLatest = 'TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC';

  // eslint-disable-next-line no-new
  new VatSupervisor({
    id: vatId,
    kernelStream,
    logger: logger.subLogger(vatId),
    vatPowers: {
      llm: makeMlcLlmProvider({
        archetypes: {
          general: llamaTinyLatest,
          fast: llamaTinyLatest,
        },
      }),
    },
  });

  logger.info('VatSupervisor initialized with vatId:', vatId);
}
