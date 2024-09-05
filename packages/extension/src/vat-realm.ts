import { createWindow } from '@metamask/snaps-utils';
import type { StreamPair } from '@ocap/streams';
import {
  initializeMessageChannel,
  makeMessagePortStreamPair,
} from '@ocap/streams';

import type { VatId } from './shared.js';
import type { VatEnvelope } from './vat.js';

export type VatRealm = {
  setup(): Promise<[object, StreamPair<VatEnvelope>]>;
  teardown(): Promise<void>;
};

const IFRAME_URI = 'iframe.html';

export const makeIframeVatRealm = (
  vatId: VatId,
  getPort?: (targetWindow: Window) => Promise<MessagePort>,
): VatRealm => {
  let port: MessagePort;
  let newWindow: Window;

  const iframeId = `ocap-iframe-${vatId}`;

  return {
    setup: async () => {
      newWindow = await createWindow(IFRAME_URI, iframeId);
      port = await (getPort ?? initializeMessageChannel)(newWindow);
      const streams = makeMessagePortStreamPair<VatEnvelope>(port);
      console.log(`Setup complete for vat with id "${vatId}"`);
      return [newWindow, streams];
    },
    teardown: async () => {
      port?.close();
      const iframe = document.getElementById(iframeId);
      /* v8 ignore next 5: Not known to be possible. */
      if (iframe === null) {
        console.error(
          `iframe of vat with id "${vatId}" already removed from DOM`,
        );
        return undefined;
      }
      iframe.remove();
      return undefined;
    },
  };
};
