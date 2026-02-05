import type {
  CapletConfig,
  HostMessage,
  IframeMessage,
  MethodHandler,
} from '../types.ts';

type RegisteredCaplet<State = unknown> = {
  state: State;
  methods: Record<string, MethodHandler<State>>;
  iframe: HTMLIFrameElement | null;
  /** Window reference for sending messages (from event.source or iframe). */
  targetWindow: WindowProxy | null;
  isReady: boolean;
  readyPromise: Promise<void>;
  resolveReady: () => void;
};

/**
 * Manages multiple caplets and widgets, routing messages by capletId.
 * All caplets/widgets communicate directly with the host via window.top.
 */
export class CapletManager {
  readonly #caplets = new Map<string, RegisteredCaplet>();

  /**
   * Creates a CapletManager and sets up the global message listener.
   */
  constructor() {
    window.addEventListener('message', this.#handleMessage);
  }

  /**
   * Registers a caplet or widget backend.
   *
   * @param capletId - Unique identifier for the caplet.
   * @param config - Caplet configuration with initial state and methods.
   */
  registerCaplet<State>(capletId: string, config: CapletConfig<State>): void {
    let resolveReady: (() => void) | undefined;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    // The resolver is guaranteed to be assigned by the Promise constructor
    const resolver = resolveReady as () => void;

    this.#caplets.set(capletId, {
      state: config.state,
      methods: config.methods as Record<string, MethodHandler<unknown>>,
      iframe: null,
      targetWindow: null,
      isReady: false,
      readyPromise,
      resolveReady: resolver,
    });
  }

  /**
   * Creates a sandboxed iframe for a registered caplet.
   *
   * @param container - DOM element to mount the iframe into.
   * @param capletId - ID of the registered caplet.
   * @param url - URL of the caplet iframe content.
   * @returns The created iframe element.
   */
  createIframe(
    container: HTMLElement,
    capletId: string,
    url: string,
  ): HTMLIFrameElement {
    const caplet = this.#caplets.get(capletId);
    if (!caplet) {
      throw new Error(`Caplet not registered: ${capletId}`);
    }

    const iframe = document.createElement('iframe');
    iframe.sandbox.add('allow-scripts');
    iframe.sandbox.add('allow-same-origin'); // Required for dev server
    iframe.src = `${url}?capletId=${encodeURIComponent(capletId)}`;

    caplet.iframe = iframe;
    // targetWindow will be set when iframe sends 'ready' message
    container.appendChild(iframe);

    return iframe;
  }

  /**
   * Waits for a caplet to signal it's ready.
   *
   * @param capletId - ID of the caplet.
   * @returns Promise that resolves when caplet is ready.
   */
  async waitForReady(capletId: string): Promise<void> {
    const caplet = this.#caplets.get(capletId);
    if (!caplet) {
      throw new Error(`Caplet not registered: ${capletId}`);
    }
    return caplet.readyPromise;
  }

  /**
   * Gets the current state of a caplet.
   *
   * @param capletId - ID of the caplet.
   * @returns Current state.
   */
  getState<State>(capletId: string): State {
    const caplet = this.#caplets.get(capletId);
    if (!caplet) {
      throw new Error(`Caplet not registered: ${capletId}`);
    }
    return caplet.state as State;
  }

  /**
   * Unregisters a caplet and removes its iframe.
   *
   * @param capletId - ID of the caplet to unregister.
   */
  unregisterCaplet(capletId: string): void {
    const caplet = this.#caplets.get(capletId);
    if (caplet?.iframe) {
      caplet.iframe.remove();
    }
    this.#caplets.delete(capletId);
  }

  /**
   * Cleans up all caplets and event listeners.
   */
  destroy(): void {
    window.removeEventListener('message', this.#handleMessage);
    for (const [capletId] of this.#caplets) {
      this.unregisterCaplet(capletId);
    }
  }

  /**
   * Sends a message to a specific caplet's iframe.
   *
   * @param capletId - ID of the target caplet.
   * @param message - Message to send (capletId will be added).
   */
  #send<State>(
    capletId: string,
    message: Omit<HostMessage<State>, 'capletId'>,
  ): void {
    const caplet = this.#caplets.get(capletId);
    if (!caplet?.targetWindow) {
      return;
    }

    const fullMessage: HostMessage<State> = {
      ...message,
      capletId,
    } as HostMessage<State>;

    caplet.targetWindow.postMessage(fullMessage, '*');
  }

  /**
   * Broadcasts state update to a caplet.
   *
   * @param capletId - ID of the caplet.
   */
  #broadcastState(capletId: string): void {
    const caplet = this.#caplets.get(capletId);
    if (!caplet?.isReady) {
      return;
    }

    this.#send(capletId, { type: 'state-update', state: caplet.state });
  }

  /**
   * Handles incoming messages from any caplet/widget iframe.
   *
   * @param event - The message event.
   */
  readonly #handleMessage = (event: MessageEvent<IframeMessage>): void => {
    const message = event.data;

    // Validate message structure
    if (!message || typeof message !== 'object' || !('capletId' in message)) {
      return;
    }

    const caplet = this.#caplets.get(message.capletId);
    if (!caplet) {
      return;
    }

    switch (message.type) {
      case 'ready':
        this.#handleReady(
          message.capletId,
          caplet,
          event.source as WindowProxy,
        );
        break;
      case 'method-call':
        this.#handleMethodCall(
          message.capletId,
          caplet,
          message.id,
          message.method,
          message.args,
        ).catch(() => undefined);
        break;
      default:
        // Ignore unknown message types
        break;
    }
  };

  /**
   * Handles the ready signal from a caplet.
   *
   * @param capletId - ID of the caplet.
   * @param caplet - The registered caplet.
   * @param source - The window that sent the message.
   */
  #handleReady(
    capletId: string,
    caplet: RegisteredCaplet,
    source: WindowProxy,
  ): void {
    caplet.isReady = true;
    caplet.targetWindow = source;
    this.#send(capletId, { type: 'init', state: caplet.state });
    caplet.resolveReady();
  }

  /**
   * Handles a method call from a caplet.
   *
   * @param capletId - ID of the caplet.
   * @param caplet - The registered caplet.
   * @param id - The call ID.
   * @param method - The method name.
   * @param args - The method arguments.
   */
  async #handleMethodCall(
    capletId: string,
    caplet: RegisteredCaplet,
    id: string,
    method: string,
    args: unknown[],
  ): Promise<void> {
    const handler = caplet.methods[method];

    if (!handler) {
      this.#send(capletId, {
        type: 'method-response',
        id,
        error: `Unknown method: ${method}`,
      });
      return;
    }

    try {
      const newState = await handler(caplet.state, ...args);
      // Re-fetch caplet after await to avoid race condition
      const currentCaplet = this.#caplets.get(capletId);
      if (currentCaplet) {
        currentCaplet.state = newState;
      }
      this.#send(capletId, { type: 'method-response', id, result: undefined });
      this.#broadcastState(capletId);
    } catch (error) {
      this.#send(capletId, {
        type: 'method-response',
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
