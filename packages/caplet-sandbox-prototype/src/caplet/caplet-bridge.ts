import type { HostMessage, IframeMessage } from '../types.ts';

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type StateSubscriber<State> = (state: State) => void;

/**
 * Bridge for communication from caplet/widget iframe to host.
 * Handles postMessage protocol and provides state subscription.
 * Communicates with window.top to support nested iframes.
 */
export class CapletBridge<State = unknown> {
  readonly #capletId: string;

  readonly #pendingCalls = new Map<string, PendingCall>();

  readonly #subscribers = new Set<StateSubscriber<State>>();

  #callId = 0;

  #state: State | null = null;

  readonly #readyPromise: Promise<State>;

  #resolveReady!: (state: State) => void;

  /**
   * Creates a CapletBridge for a specific caplet.
   *
   * @param capletId - Unique identifier for this caplet.
   */
  constructor(capletId: string) {
    this.#capletId = capletId;

    this.#readyPromise = new Promise((resolve) => {
      this.#resolveReady = resolve;
    });

    window.addEventListener('message', this.#handleMessage);

    // Send ready signal to host (window.top)
    this.#sendToHost({ type: 'ready' });
  }

  /**
   * Gets the caplet ID.
   *
   * @returns The caplet ID.
   */
  getCapletId(): string {
    return this.#capletId;
  }

  /**
   * Waits for initial state from host.
   *
   * @returns Promise that resolves with initial state.
   */
  async waitForInit(): Promise<State> {
    return this.#readyPromise;
  }

  /**
   * Gets the current state.
   *
   * @returns Current state or null if not initialized.
   */
  getState(): State | null {
    return this.#state;
  }

  /**
   * Subscribes to state changes.
   *
   * @param subscriber - Callback function called with new state.
   * @returns Unsubscribe function.
   */
  subscribe(subscriber: StateSubscriber<State>): () => void {
    this.#subscribers.add(subscriber);
    return () => {
      this.#subscribers.delete(subscriber);
    };
  }

  /**
   * Calls a method on the host backend.
   *
   * @param method - Method name.
   * @param args - Method arguments.
   * @returns Promise that resolves with method result.
   */
  async callMethod<Result>(method: string, args: unknown[]): Promise<Result> {
    const id = this.#generateCallId();

    const promise = new Promise<Result>((resolve, reject) => {
      this.#pendingCalls.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });

    this.#sendToHost({ type: 'method-call', id, method, args });

    return promise;
  }

  /**
   * Sends a message to the host (window.top).
   *
   * @param message - The message to send (capletId will be added).
   */
  #sendToHost(message: Omit<IframeMessage, 'capletId'>): void {
    const fullMessage: IframeMessage = {
      ...message,
      capletId: this.#capletId,
    } as IframeMessage;

    // Always send to window.top to support nested iframes
    window.top?.postMessage(fullMessage, '*');
  }

  /**
   * Handles incoming messages from the host.
   *
   * @param event - The message event.
   */
  readonly #handleMessage = (event: MessageEvent<HostMessage<State>>): void => {
    const message = event.data;

    // Validate message structure and filter by capletId
    if (
      !message ||
      typeof message !== 'object' ||
      !('capletId' in message) ||
      message.capletId !== this.#capletId
    ) {
      return;
    }

    switch (message.type) {
      case 'init':
        this.#handleInit(message.state);
        break;
      case 'state-update':
        this.#handleStateUpdate(message.state);
        break;
      case 'method-response':
        this.#handleMethodResponse(message.id, message.result, message.error);
        break;
      default:
        // Ignore unknown message types
        break;
    }
  };

  /**
   * Handles the init message from the host.
   *
   * @param state - The initial state.
   */
  #handleInit(state: State): void {
    this.#state = state;
    this.#resolveReady(state);
    this.#notifySubscribers();
  }

  /**
   * Handles a state update message from the host.
   *
   * @param state - The updated state.
   */
  #handleStateUpdate(state: State): void {
    this.#state = state;
    this.#notifySubscribers();
  }

  /**
   * Handles a method response from the host.
   *
   * @param id - The call ID.
   * @param result - The result value.
   * @param error - The error message if any.
   */
  #handleMethodResponse(
    id: string,
    result: unknown,
    error: string | undefined,
  ): void {
    const pending = this.#pendingCalls.get(id);
    if (!pending) {
      return;
    }

    this.#pendingCalls.delete(id);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }

  /**
   * Notifies all subscribers of a state change.
   */
  #notifySubscribers(): void {
    if (this.#state) {
      for (const subscriber of this.#subscribers) {
        subscriber(this.#state);
      }
    }
  }

  /**
   * Generates a unique call ID.
   *
   * @returns A unique call ID string.
   */
  #generateCallId(): string {
    this.#callId += 1;
    return `call-${this.#callId}`;
  }
}

// Global bridge instance, initialized by bootstrap
let globalBridge: CapletBridge | null = null;

/**
 * Gets the global bridge instance.
 *
 * @returns The global CapletBridge instance.
 */
export function getBridge<State>(): CapletBridge<State> {
  if (!globalBridge) {
    throw new Error('Bridge not initialized. Call initBridge() first.');
  }
  return globalBridge as CapletBridge<State>;
}

/**
 * Initializes the global bridge with a capletId.
 *
 * @param capletId - The caplet ID.
 * @returns The initialized bridge.
 */
export function initBridge<State>(capletId: string): CapletBridge<State> {
  if (globalBridge) {
    throw new Error('Bridge already initialized.');
  }
  globalBridge = new CapletBridge<State>(capletId);
  return globalBridge as CapletBridge<State>;
}
