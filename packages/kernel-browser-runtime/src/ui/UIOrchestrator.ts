import { Logger } from '@metamask/logger';
import { initializeMessageChannel } from '@metamask/streams/browser';

/**
 * Unique identifier for a UI vat.
 */
export type UiVatId = string;

/**
 * Name of a slot where UI vats can be rendered.
 * Currently only 'main' is supported.
 */
export type SlotName = 'main';

/**
 * Configuration for a UI vat.
 */
export type UiVatConfig = {
  /** Unique identifier for the UI vat */
  id: UiVatId;
  /** URI of the HTML document to load in the iframe */
  uri: string;
  /** Name of the slot to render into */
  slot: SlotName;
  /** Optional title for the iframe (used for accessibility) */
  title?: string;
  /** Whether the iframe should be visible immediately */
  visible?: boolean;
};

/**
 * State of a UI vat managed by the orchestrator.
 */
export type UiVatState = {
  /** The UI vat configuration */
  config: UiVatConfig;
  /** The iframe element */
  iframe: HTMLIFrameElement;
  /** The MessagePort for communication with the UI vat */
  port: MessagePort;
  /** The slot this UI vat is rendered in */
  slot: SlotName;
  /** Whether the UI vat is currently visible */
  visible: boolean;
};

/**
 * Options for creating a UIOrchestrator.
 */
export type UIOrchestratorOptions = {
  /** Named slots where UI vats can be rendered */
  slots: Record<SlotName, HTMLElement>;
  /** Logger instance */
  logger?: Logger;
};

/**
 * The sandbox attribute value for UI vat iframes.
 *
 * UI vats run under lockdown() but need DOM access for rendering.
 * We allow:
 * - allow-scripts: Required for JavaScript execution
 * - allow-same-origin: Required for CapTP communication via postMessage
 *
 * We intentionally do NOT allow:
 * - allow-forms: No form submission
 * - allow-popups: No popup windows
 * - allow-top-navigation: Cannot navigate the parent
 * - allow-modals: No alert/confirm/prompt
 */
const UI_VAT_SANDBOX = 'allow-scripts allow-same-origin';

/**
 * CSS class applied to all UI vat iframes.
 */
const UI_VAT_IFRAME_CLASS = 'ui-vat-iframe';

/**
 * Orchestrates the creation, lifecycle, and communication of UI vat iframes.
 *
 * UI vats are visible iframes that run hardened JavaScript (under lockdown())
 * and can render UI using DOM APIs. They communicate with bootstrap vats
 * via CapTP over MessageChannel.
 *
 * Unlike headless vat iframes (which run VatSupervisor), UI vats are intended
 * for user-facing interfaces within caplets.
 */
export class UIOrchestrator {
  readonly #slots: Record<SlotName, HTMLElement>;

  readonly #logger: Logger;

  readonly #uiVats: Map<UiVatId, UiVatState> = new Map();

  readonly #launchesInProgress: Set<UiVatId> = new Set();

  /**
   * Creates a new UIOrchestrator.
   *
   * @param options - The orchestrator options.
   * @param options.slots - Named slots where UI vats can be rendered.
   * @param options.logger - Logger instance.
   */
  constructor({ slots, logger }: UIOrchestratorOptions) {
    this.#slots = slots;
    this.#logger = logger ?? new Logger('UIOrchestrator');
    harden(this);
  }

  /**
   * Factory method to create a UIOrchestrator.
   *
   * @param options - The orchestrator options.
   * @returns A new UIOrchestrator instance.
   */
  static make(options: UIOrchestratorOptions): UIOrchestrator {
    return new UIOrchestrator(options);
  }

  /**
   * Launch a new UI vat.
   *
   * Creates a sandboxed iframe, sets up a MessageChannel for communication,
   * and waits for the iframe to signal readiness.
   *
   * @param config - The UI vat configuration.
   * @returns A promise that resolves to the MessagePort for communicating with the UI vat.
   * @throws If a UI vat with the same ID already exists.
   */
  async launch(config: UiVatConfig): Promise<MessagePort> {
    const { id, uri, slot, title, visible = true } = config;

    if (this.#uiVats.has(id) || this.#launchesInProgress.has(id)) {
      throw new Error(`UI vat "${id}" already exists`);
    }

    const slotElement = this.#slots[slot];
    if (!slotElement) {
      throw new Error(`Slot "${slot}" not found`);
    }

    this.#launchesInProgress.add(id);

    this.#logger.info(`Launching UI vat: ${id} in slot: ${slot}`);

    let iframe: HTMLIFrameElement | undefined;
    let port: MessagePort;
    try {
      iframe = this.#createIframe(id, uri, title, visible);
      slotElement.appendChild(iframe);

      // Wait for iframe to load and establish MessageChannel
      port = await this.#establishConnection(iframe);
    } catch (error) {
      // Clean up iframe if it was created and appended
      iframe?.remove();
      this.#launchesInProgress.delete(id);
      throw error;
    }

    const state: UiVatState = {
      config,
      iframe,
      port,
      slot,
      visible,
    };
    this.#uiVats.set(id, state);
    this.#launchesInProgress.delete(id);

    this.#logger.info(`UI vat "${id}" launched successfully in slot: ${slot}`);
    return port;
  }

  /**
   * Terminate a UI vat.
   *
   * Closes the MessagePort and removes the iframe from the DOM.
   *
   * @param id - The ID of the UI vat to terminate.
   * @throws If the UI vat does not exist.
   */
  terminate(id: UiVatId): void {
    const state = this.#uiVats.get(id);
    if (!state) {
      throw new Error(`UI vat "${id}" not found`);
    }

    this.#logger.info(`Terminating UI vat: ${id}`);

    // Close the port
    state.port.close();

    // Remove iframe from DOM
    state.iframe.remove();

    // Remove from our tracking
    this.#uiVats.delete(id);

    this.#logger.info(`UI vat "${id}" terminated`);
  }

  /**
   * Terminate all UI vats.
   */
  terminateAll(): void {
    this.#logger.info('Terminating all UI vats');
    for (const id of Array.from(this.#uiVats.keys())) {
      this.terminate(id);
    }
  }

  /**
   * Show a UI vat's iframe.
   *
   * @param id - The ID of the UI vat.
   * @throws If the UI vat does not exist.
   */
  show(id: UiVatId): void {
    const state = this.#getState(id);
    state.iframe.style.display = '';
    state.visible = true;
    this.#logger.info(`UI vat "${id}" shown`);
  }

  /**
   * Hide a UI vat's iframe.
   *
   * @param id - The ID of the UI vat.
   * @throws If the UI vat does not exist.
   */
  hide(id: UiVatId): void {
    const state = this.#getState(id);
    state.iframe.style.display = 'none';
    state.visible = false;
    this.#logger.info(`UI vat "${id}" hidden`);
  }

  /**
   * Check if a UI vat exists.
   *
   * @param id - The ID of the UI vat.
   * @returns True if the UI vat exists.
   */
  has(id: UiVatId): boolean {
    return this.#uiVats.has(id);
  }

  /**
   * Get the IDs of all active UI vats.
   *
   * @returns Array of UI vat IDs.
   */
  getIds(): UiVatId[] {
    return Array.from(this.#uiVats.keys());
  }

  /**
   * Get the names of all available slots.
   *
   * @returns Array of slot names.
   */
  getSlotNames(): SlotName[] {
    return Object.keys(this.#slots) as SlotName[];
  }

  /**
   * Get the IDs of UI vats rendered in a specific slot.
   *
   * @param slot - The slot name.
   * @returns Array of UI vat IDs in the slot.
   */
  getVatsInSlot(slot: SlotName): UiVatId[] {
    return Array.from(this.#uiVats.entries())
      .filter(([_, state]) => state.slot === slot)
      .map(([id]) => id);
  }

  /**
   * Get the slot a UI vat is rendered in.
   *
   * @param id - The ID of the UI vat.
   * @returns The slot name.
   * @throws If the UI vat does not exist.
   */
  getSlot(id: UiVatId): SlotName {
    return this.#getState(id).slot;
  }

  /**
   * Get the MessagePort for a UI vat.
   *
   * @param id - The ID of the UI vat.
   * @returns The MessagePort for the UI vat.
   * @throws If the UI vat does not exist.
   */
  getPort(id: UiVatId): MessagePort {
    return this.#getState(id).port;
  }

  /**
   * Get the iframe element for a UI vat.
   *
   * This is primarily for testing and debugging.
   *
   * @param id - The ID of the UI vat.
   * @returns The iframe element.
   * @throws If the UI vat does not exist.
   */
  getIframe(id: UiVatId): HTMLIFrameElement {
    return this.#getState(id).iframe;
  }

  /**
   * Get the state of a UI vat.
   *
   * @param id - The ID of the UI vat.
   * @returns The UI vat state.
   * @throws If the UI vat does not exist.
   */
  #getState(id: UiVatId): UiVatState {
    const state = this.#uiVats.get(id);
    if (!state) {
      throw new Error(`UI vat "${id}" not found`);
    }
    return state;
  }

  /**
   * Create an iframe element for a UI vat.
   *
   * @param id - The UI vat ID.
   * @param uri - The URI to load.
   * @param title - Optional accessibility title.
   * @param visible - Whether the iframe should be initially visible.
   * @returns The configured iframe element.
   */
  #createIframe(
    id: UiVatId,
    uri: string,
    title?: string,
    visible = true,
  ): HTMLIFrameElement {
    const iframe = document.createElement('iframe');

    // Identity
    iframe.id = `ui-vat-${id}`;
    iframe.className = UI_VAT_IFRAME_CLASS;
    iframe.dataset.uiVatId = id;
    iframe.dataset.testid = `ui-vat-iframe-${id}`;

    // Security: sandbox with minimal permissions
    iframe.sandbox.value = UI_VAT_SANDBOX;

    // Accessibility
    iframe.title = title ?? `UI Vat: ${id}`;

    // Visibility
    if (!visible) {
      iframe.style.display = 'none';
    }

    // Source - add uiVatId as query parameter
    const url = new URL(uri, window.location.href);
    url.searchParams.set('uiVatId', id);
    iframe.src = url.toString();

    return iframe;
  }

  /**
   * Wait for an iframe to finish loading.
   *
   * @param iframe - The iframe to wait for.
   * @returns A promise that resolves when the iframe is loaded.
   */
  async #waitForIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
    // Check if already loaded
    if (iframe.contentWindow) {
      try {
        // Try to access document to check if loaded
        // This may throw if cross-origin
        const _doc = iframe.contentDocument;
        if (_doc?.readyState === 'complete') {
          return Promise.resolve();
        }
      } catch {
        // Cross-origin, wait for load event
      }
    }

    return new Promise<void>((resolve, reject) => {
      // Use AbortController for cleanup to avoid circular reference issues
      const controller = new AbortController();
      const { signal } = controller;

      iframe.addEventListener(
        'load',
        () => {
          controller.abort();
          resolve();
        },
        { signal },
      );

      iframe.addEventListener(
        'error',
        (event: Event) => {
          controller.abort();
          reject(
            new Error(
              `Failed to load iframe: ${(event as ErrorEvent).message ?? 'Unknown error'}`,
            ),
          );
        },
        { signal },
      );
    });
  }

  /**
   * Establish a MessageChannel connection with an iframe.
   *
   * Waits for the iframe to load, then uses initializeMessageChannel
   * to establish a port pair for communication.
   *
   * @param iframe - The iframe to connect to.
   * @returns A promise that resolves to the local MessagePort.
   */
  async #establishConnection(iframe: HTMLIFrameElement): Promise<MessagePort> {
    // Wait for iframe to load
    await this.#waitForIframeLoad(iframe);

    const { contentWindow } = iframe;
    if (!contentWindow) {
      throw new Error('Iframe contentWindow is null after load');
    }

    // Establish MessageChannel using the standard initialization protocol
    const port = await initializeMessageChannel((message, transfer) =>
      contentWindow.postMessage(message, '*', transfer),
    );

    return port;
  }
}
harden(UIOrchestrator);
