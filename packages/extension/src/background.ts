import { delay } from '@metamask/kernel-utils';
import type { JsonRpcCall } from '@metamask/kernel-utils';
import { kernelMethodSpecs } from '@metamask/ocap-kernel/rpc';
import { isJsonRpcResponse } from '@metamask/utils';
import type { JsonRpcResponse } from '@metamask/utils';
import { Logger } from '@ocap/logger';
import { RpcClient } from '@ocap/rpc-methods';
import { ChromeRuntimeDuplexStream } from '@ocap/streams/browser';

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

const logger = new Logger('background');

main().catch(logger.error);

/**
 * The main function for the background script.
 */
async function main(): Promise<void> {
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
    justification: `Surely you won't object to our capabilities?`,
  });

  // Without this delay, sending messages via the chrome.runtime API can fail.
  await delay(50);

  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    JsonRpcResponse,
    JsonRpcCall
  >(chrome.runtime, 'background', 'offscreen', isJsonRpcResponse);

  const rpcClient = new RpcClient(
    kernelMethodSpecs,
    async (request) => {
      await offscreenStream.write(request);
    },
    'background:',
  );

  const ping = async (): Promise<void> => {
    const result = await rpcClient.call('ping', []);
    logger.info(result);
  };

  // globalThis.kernel will exist due to dev-console.js in background-trusted-prelude.js
  Object.defineProperties(globalThis.kernel, {
    ping: {
      value: ping,
    },
    sendMessage: {
      value: async (message: JsonRpcCall) =>
        await offscreenStream.write(message),
    },
  });
  harden(globalThis.kernel);

  // With this we can click the extension action button to wake up the service worker.
  chrome.action.onClicked.addListener(() => {
    ping().catch(logger.error);
  });

  await offscreenStream.drain(async (message) =>
    rpcClient.handleResponse(message.id as string, message),
  );
  throw new Error('Offscreen connection closed unexpectedly');
}
