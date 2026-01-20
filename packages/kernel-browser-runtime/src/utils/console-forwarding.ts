import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { DuplexStream } from '@metamask/streams';
import type { JsonRpcNotification } from '@metamask/utils';

/**
 * Message type for forwarding console output from one context to another.
 * Used to capture console logs from offscreen documents in Playwright tests.
 */
export type ConsoleForwardMessage = JsonRpcNotification & {
  method: 'console-forward';
  params: {
    method: 'log' | 'debug' | 'info' | 'warn' | 'error';
    args: string[];
  };
};

/**
 * Type guard for console-forward messages.
 *
 * @param value - The value to check.
 * @returns Whether the value is a ConsoleForwardMessage.
 */
export const isConsoleForwardMessage = (
  value: unknown,
): value is ConsoleForwardMessage =>
  typeof value === 'object' &&
  value !== null &&
  'method' in value &&
  (value as { method: unknown }).method === 'console-forward';

/**
 * Wraps console methods to forward messages to background via a stream.
 * This enables capturing console output from contexts that Playwright cannot
 * directly access (like offscreen documents).
 *
 * Call this early after the stream is created. After setup, console output
 * will be forwarded to the stream recipient where it can be replayed.
 *
 * @param stream - The stream to write console messages to.
 */
export function setupConsoleForwarding(
  stream: DuplexStream<JsonRpcMessage, JsonRpcMessage>,
): void {
  const originalConsole = { ...console };
  const consoleMethods = ['log', 'debug', 'info', 'warn', 'error'] as const;

  consoleMethods.forEach((consoleMethod) => {
    // eslint-disable-next-line no-console
    console[consoleMethod] = (...args: unknown[]) => {
      // Call original console method
      originalConsole[consoleMethod](...args);

      // Forward to background via stream
      const message: ConsoleForwardMessage = {
        jsonrpc: '2.0',
        method: 'console-forward',
        params: {
          method: consoleMethod,
          args: args.map((arg) => {
            if (typeof arg === 'string') {
              return arg;
            }
            if (typeof arg === 'number' || typeof arg === 'boolean') {
              return String(arg);
            }
            // Objects, arrays, null, undefined, functions, symbols, etc.
            return JSON.stringify(arg);
          }),
        },
      };
      stream.write(message).catch(() => {
        // Ignore errors if stream isn't ready
      });
    };
  });

  harden(globalThis.console);
}

/**
 * Handles a console-forward message by replaying it to the local console.
 * Use this in the stream handler to replay forwarded console output.
 *
 * @param message - The console-forward message to handle.
 * @param prefix - Optional prefix to add to the message (e.g., '[offscreen]').
 */
export function handleConsoleForwardMessage(
  message: ConsoleForwardMessage,
  prefix?: string,
): void {
  const { method, args } = message.params;
  // eslint-disable-next-line no-console
  console[method](...(prefix ? [prefix, ...args] : args));
}
