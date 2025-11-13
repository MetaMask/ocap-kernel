import { Logger } from '@metamask/logger';
import { initializeMessageChannel } from '@metamask/streams/browser';

import type { InstalledCaplet } from '../types/caplet.ts';

const logger = new Logger('ui-renderer');

/**
 * UI mount point types.
 */
export type UIMountPoint = 'popup' | 'sidebar' | 'modal' | 'custom';

/**
 * UI renderer service for securely rendering caplet UIs in isolated iframes.
 */
export class UIRendererService {
  readonly #renderedUIs: Map<string, HTMLIFrameElement> = new Map();

  /**
   * Render a caplet's UI in an isolated iframe.
   *
   * @param capletId - The caplet ID to render.
   * @param caplet - The installed caplet metadata.
   * @param mountPoint - Where to mount the UI.
   * @param container - The container element to mount the iframe in.
   * @returns The created iframe element.
   */
  async renderCapletUI(
    capletId: string,
    caplet: InstalledCaplet,
    mountPoint: UIMountPoint,
    container: HTMLElement,
  ): Promise<HTMLIFrameElement> {
    logger.log(
      `Rendering UI for caplet: ${capletId} at mount point: ${mountPoint}`,
    );

    // Check if already rendered
    const existing = this.#renderedUIs.get(capletId);
    if (existing) {
      logger.log(`UI for caplet ${capletId} already rendered`);
      return existing;
    }

    // Get UI configuration from manifest
    const uiConfig = caplet.manifest.ui;
    if (!uiConfig) {
      throw new Error(`Caplet ${capletId} does not have UI configuration`);
    }

    // Create iframe
    const iframe = document.createElement('iframe');
    const iframeId = `caplet-ui-${capletId}`;
    iframe.id = iframeId;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    // Set iframe source to caplet UI iframe template
    // The UI bundle will be loaded within the iframe
    const uiBundleUrl = caplet.manifest.bundleSpec; // For now, use bundleSpec
    const iframeUrl = new URL('caplet-ui-iframe.html', window.location.href);
    iframeUrl.searchParams.set('capletId', capletId);
    iframeUrl.searchParams.set('uiBundle', uiBundleUrl);
    iframeUrl.searchParams.set('entryPoint', uiConfig.entryPoint);

    iframe.src = iframeUrl.toString();

    // Append to container
    container.appendChild(iframe);

    // Wait for iframe to load
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Timeout waiting for caplet UI iframe to load: ${capletId}`,
          ),
        );
      }, 10000);

      iframe.onload = () => {
        clearTimeout(timeout);
        resolve();
      };

      iframe.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
    });

    // Set up message channel for communication
    const port = await initializeMessageChannel((message, transfer) =>
      iframe.contentWindow?.postMessage(message, '*', transfer),
    );

    // Store iframe reference
    this.#renderedUIs.set(capletId, iframe);

    logger.log(`Successfully rendered UI for caplet: ${capletId}`);
    return iframe;
  }

  /**
   * Unmount a caplet's UI.
   *
   * @param capletId - The caplet ID to unmount.
   */
  unmountCapletUI(capletId: string): void {
    logger.log(`Unmounting UI for caplet: ${capletId}`);

    const iframe = this.#renderedUIs.get(capletId);
    if (iframe) {
      iframe.remove();
      this.#renderedUIs.delete(capletId);
      logger.log(`Successfully unmounted UI for caplet: ${capletId}`);
    } else {
      logger.warn(`No UI found for caplet: ${capletId}`);
    }
  }

  /**
   * Check if a caplet's UI is currently rendered.
   *
   * @param capletId - The caplet ID to check.
   * @returns True if the UI is rendered.
   */
  isUIRendered(capletId: string): boolean {
    return this.#renderedUIs.has(capletId);
  }

  /**
   * Get the iframe element for a rendered caplet UI.
   *
   * @param capletId - The caplet ID.
   * @returns The iframe element or undefined if not rendered.
   */
  getCapletUIIframe(capletId: string): HTMLIFrameElement | undefined {
    return this.#renderedUIs.get(capletId);
  }

  /**
   * Create a capability for UI rendering.
   * This allows caplets to request UI rendering capabilities.
   *
   * @param capletId - The caplet ID.
   * @param caplet - The installed caplet metadata.
   * @returns A UI capability object.
   */
  createUICapability(
    capletId: string,
    caplet: InstalledCaplet,
  ): {
    render: (
      mountPoint: UIMountPoint,
      container: HTMLElement,
    ) => Promise<HTMLIFrameElement>;
    unmount: () => void;
  } {
    return {
      render: async (mountPoint: UIMountPoint, container: HTMLElement) => {
        return this.renderCapletUI(capletId, caplet, mountPoint, container);
      },
      unmount: () => {
        this.unmountCapletUI(capletId);
      },
    };
  }

  /**
   * Unmount all rendered caplet UIs.
   */
  unmountAll(): void {
    logger.log('Unmounting all caplet UIs');
    for (const capletId of this.#renderedUIs.keys()) {
      this.unmountCapletUI(capletId);
    }
  }
}

/**
 * Singleton instance of the UI renderer service.
 */
export const uiRendererService = new UIRendererService();
