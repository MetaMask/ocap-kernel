import { createWindow } from '@metamask/snaps-utils';
import type {
  VatId,
  VatWorker,
  StreamEnvelopeReply,
  StreamEnvelope,
} from '@ocap/kernel';
import type { initializeMessageChannel } from '@ocap/streams';
import { makeMessagePortStreamPair } from '@ocap/streams';

const IFRAME_URI = 'iframe.html';

/**
 * Get a DOM id for our iframes, for greater collision resistance.
 *
 * @param id - The vat id to base the DOM id on.
 * @returns The DOM id.
 */
const getHtmlId = (id: VatId): string => `ocap-iframe-${id}`;

export const makeIframeVatWorker = (
  id: VatId,
  getPort: typeof initializeMessageChannel,
): VatWorker => {
  return {
    init: async () => {
      const newWindow = await createWindow(IFRAME_URI, getHtmlId(id));
      const port = await getPort(newWindow);
      const streams = makeMessagePortStreamPair<
        StreamEnvelopeReply,
        StreamEnvelope
      >(port);

      return [streams, newWindow];
    },
    delete: async (): Promise<void> => {
      const iframe = document.getElementById(getHtmlId(id));
      /* v8 ignore next 6: Not known to be possible. */
      if (iframe === null) {
        console.error(`iframe of vat with id "${id}" already removed from DOM`);
        return undefined;
      }
      iframe.remove();
      return undefined;
    },
  };
};
