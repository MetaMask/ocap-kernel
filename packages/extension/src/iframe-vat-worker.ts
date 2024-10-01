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

export const makeIframeVatWorker = (
  id: VatId,
  getPort: typeof initializeMessageChannel,
): VatWorker => {
  const vatHtmlId = `ocap-iframe-${id}`;
  return {
    init: async () => {
      const newWindow = await createWindow({
        uri: IFRAME_URI,
        id: vatHtmlId,
        testId: vatHtmlId,
      });
      const port = await getPort(newWindow);
      const streams = makeMessagePortStreamPair<
        StreamEnvelopeReply,
        StreamEnvelope
      >(port);

      return [streams, newWindow];
    },
    delete: async (): Promise<void> => {
      const iframe = document.getElementById(vatHtmlId);
      /* v8 ignore next 6: Not known to be possible. */
      if (iframe === null) {
        console.error(
          `iframe of vat with id "${id}" already removed from DOM (#${vatHtmlId})`,
        );
        return undefined;
      }
      iframe.remove();
      return undefined;
    },
  };
};
