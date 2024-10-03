import { createWindow } from '@metamask/snaps-utils';
import type { VatId, VatWorker } from '@ocap/kernel';
import type { initializeMessageChannel } from '@ocap/streams';

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
        testId: 'ocap-iframe',
      });
      const port = await getPort(newWindow);

      return [port, newWindow];
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
