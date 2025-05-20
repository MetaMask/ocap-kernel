import { Logger } from '@metamask/logger';
import type { VatId, VatConfig } from '@metamask/ocap-kernel';
import { createWindow } from '@metamask/snaps-utils';
import type { initializeMessageChannel } from '@metamask/streams/browser';

import type { VatWorker } from './VatWorkerServer.ts';

type Options = {
  id: VatId;
  getPort: typeof initializeMessageChannel;
  logger: Logger;
  iframeUri: string;
  testId?: string;
};

/**
 * Create a vat worker that launches a new window with an iframe.
 *
 * @param options - The options for the vat worker.
 * @param options.id - The id of the vat.
 * @param options.getPort - The function to get the port for the vat.
 * @param options.logger - The logger for the vat.
 * @param options.iframeUri - The uri of the iframe.
 * @param options.testId - The test id of the iframe element, for use in e2e tests.
 * @returns The vat worker.
 */
export const makeIframeVatWorker = ({
  id,
  getPort,
  logger,
  iframeUri,
  testId = 'ocap-iframe',
}: Options): VatWorker => {
  const vatHtmlId = `ocap-iframe-${id}`;
  return {
    launch: async (_vatConfig: VatConfig) => {
      const newWindow = await createWindow({
        uri: `${iframeUri}?vatId=${id}`,
        id: vatHtmlId,
        testId,
      });
      const port = await getPort((message, transfer) =>
        newWindow.postMessage(message, '*', transfer),
      );

      return [port, newWindow];
    },
    terminate: async (): Promise<void> => {
      const iframe = document.getElementById(vatHtmlId);
      if (iframe === null) {
        logger.error(
          `iframe of vat with id "${id}" already removed from DOM (#${vatHtmlId})`,
        );
        return undefined;
      }
      iframe.remove();
      return undefined;
    },
  };
};
