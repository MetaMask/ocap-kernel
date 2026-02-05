/**
 * Base message type with caplet routing.
 */
type BaseMessage = {
  capletId: string;
};

/**
 * Messages sent from host to iframe.
 */
export type HostMessage<State = unknown> = BaseMessage &
  (
    | { type: 'init'; state: State }
    | { type: 'state-update'; state: State }
    | { type: 'method-response'; id: string; result?: unknown; error?: string }
  );

/**
 * Messages sent from iframe to host.
 */
export type IframeMessage = BaseMessage &
  (
    | { type: 'ready' }
    | { type: 'method-call'; id: string; method: string; args: unknown[] }
  );

/**
 * Main caplet application state.
 */
export type MainCapletState = {
  items: string[];
  counter: number;
};

/**
 * Color widget state.
 */
export type ColorWidgetState = {
  color: string;
};

/**
 * Backend interface exposed to main caplet.
 */
export type MainCapletBackend = {
  addItem: (item: string) => Promise<void>;
  removeItem: (index: number) => Promise<void>;
  increment: () => Promise<void>;
  decrement: () => Promise<void>;
};

/**
 * Backend interface exposed to color widget.
 */
export type ColorWidgetBackend = {
  setColor: (color: string) => Promise<void>;
};

/**
 * Method handler function type.
 */
export type MethodHandler<State> = (
  state: State,
  ...args: unknown[]
) => State | Promise<State>;

/**
 * Caplet registration configuration.
 */
export type CapletConfig<State> = {
  state: State;
  methods: Record<string, MethodHandler<State>>;
};
