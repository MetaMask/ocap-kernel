import { createWindow } from '@metamask/snaps-utils';
import type { VatId } from '@ocap/kernel';
import type { initializeMessageChannel } from '@ocap/streams';

import type { VatWorker } from './vat-worker-service.js';

const IFRAME_URI = 'iframe.html';

export const makeIframeVatWorker = (
  id: VatId,
  getPort: typeof initializeMessageChannel,
): VatWorker => {
  const vatHtmlId = `ocap-iframe-${id}`;
  return {
    launch: async () => {
      const newWindow = await createWindow({
        uri: IFRAME_URI,
        id: vatHtmlId,
        testId: 'ocap-iframe',
      });
      const port = await getPort((message, transfer) =>
        newWindow.postMessage(message, '*', transfer),
      );

      return [port, newWindow];
    },
    terminate: async (): Promise<void> => {
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
