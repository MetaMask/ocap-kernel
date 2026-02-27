import { Logger } from '@metamask/logger';
import type { VatConfig } from '@metamask/ocap-kernel';

import type { VatWorker } from '../PlatformServicesServer.ts';
import type { UiVatId, SlotName } from './UIOrchestrator.ts';
import { UIOrchestrator } from './UIOrchestrator.ts';

/**
 * Options for creating a UI vat worker factory.
 */
export type MakeUIVatWorkerOptions = {
  /** Unique identifier for this UI vat */
  id: UiVatId;
  /** URI of the UI vat iframe HTML (e.g., './vat/iframe.html') */
  iframeUri: string;
  /** Shared UIOrchestrator instance */
  orchestrator: UIOrchestrator;
  /** Name of the slot to render into */
  slot: SlotName;
  /** Optional title for the iframe (used for accessibility) */
  title?: string;
  /** Whether the iframe should be visible immediately (default: true) */
  visible?: boolean;
  /** Optional logger instance */
  logger?: Logger;
};

/**
 * Create a VatWorker that launches a UI vat in a visible iframe.
 *
 * Uses a shared UIOrchestrator to manage the iframe in a specific slot.
 *
 * @param options - Configuration for the UI vat worker.
 * @param options.id - Unique identifier for this UI vat.
 * @param options.iframeUri - URI of the UI vat iframe HTML.
 * @param options.orchestrator - Shared UIOrchestrator instance.
 * @param options.slot - Name of the slot to render into.
 * @param options.title - Optional title for the iframe (used for accessibility).
 * @param options.visible - Whether the iframe should be visible immediately.
 * @param options.logger - Optional logger instance.
 * @returns A VatWorker interface for kernel integration.
 * @example
 * ```typescript
 * const orchestrator = UIOrchestrator.make({
 *   slots: { main: document.getElementById('main-slot')! },
 * });
 *
 * const uiWorker = makeUIVatWorker({
 *   id: 'my-ui-vat',
 *   iframeUri: './vat/iframe.html',
 *   orchestrator,
 *   slot: 'main',
 * });
 *
 * const [port, _window] = await uiWorker.launch(vatConfig);
 * // Use port for CapTP communication
 * ```
 */
export const makeUIVatWorker = ({
  id,
  iframeUri,
  orchestrator,
  slot,
  title,
  visible = true,
  logger,
}: MakeUIVatWorkerOptions): VatWorker => {
  const workerLogger = logger ?? new Logger('makeUIVatWorker');

  return {
    launch: async (_vatConfig: VatConfig): Promise<[MessagePort, unknown]> => {
      const port = await orchestrator.launch({
        id,
        uri: iframeUri,
        slot,
        ...(title !== undefined && { title }),
        visible,
      });

      // Return the port and iframe window (for consistency with makeIframeVatWorker)
      const iframe = orchestrator.getIframe(id);
      return [port, iframe.contentWindow];
    },

    terminate: async (): Promise<null> => {
      if (orchestrator.has(id)) {
        orchestrator.terminate(id);
      } else {
        workerLogger.warn(`UI vat "${id}" not found for termination`);
      }
      return null;
    },
  };
};
