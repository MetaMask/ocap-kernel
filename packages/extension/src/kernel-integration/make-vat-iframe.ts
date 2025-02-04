import { createWindow } from '@metamask/snaps-utils';
import type { Json } from '@metamask/utils';
import type { VatId, VatConfig } from '@ocap/kernel';
import type { initializeMessageChannel } from '@ocap/streams';

import type { VatWorker } from './VatWorkerServer.js';

export const makeVatIframe = (
  id: VatId,
  getPort: typeof initializeMessageChannel,
  creationOptions?: Record<string, Json>,
): VatWorker => {
  const vatHtmlId = `ocap-iframe-${id}`;
  const iframeUri = creationOptions?.usePersistence
    ? 'vat-webworker.html'
    : 'vat-iframe.html';
  console.log('makeVatIframe', { id, iframeUri, creationOptions });
  return {
    launch: async (_vatConfig: VatConfig) => {
      const newWindow = await createWindow({
        uri: `${iframeUri}?vatId=${id}`,
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
