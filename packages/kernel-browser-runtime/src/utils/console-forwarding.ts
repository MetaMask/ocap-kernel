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
    source: string;
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
 * Stringifies an argument for console forwarding.
 *
 * @param arg - The argument to stringify.
 * @returns The stringified argument.
 */
export function stringifyConsoleArg(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg;
  }
  if (typeof arg === 'number' || typeof arg === 'boolean') {
    return String(arg);
  }
  // Objects, arrays, null, undefined, functions, symbols, etc.
  return JSON.stringify(arg);
}

/**
 * Wraps console methods to forward messages to background via a stream.
 * This enables capturing console output from contexts that Playwright cannot
 * directly access (like offscreen documents).
 *
 * Call this early after the stream is created. After setup, console output
 * will be forwarded to the stream recipient where it can be replayed.
 *
 * @param stream - The stream to write console messages to.
 * @param source - The source identifier for this context (e.g., 'offscreen', 'kernel-worker').
 */
export function setupConsoleForwarding(
  stream: DuplexStream<JsonRpcMessage, JsonRpcMessage>,
  source: string,
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
          source,
          method: consoleMethod,
          args: args.map(stringifyConsoleArg),
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
 */
export function handleConsoleForwardMessage(
  message: ConsoleForwardMessage,
): void {
  const { source, method, args } = message.params;
  // eslint-disable-next-line no-console
  console[method](`[${source}]`, ...args);
}

/**
 * Wraps console methods to forward messages to parent window via postMessage.
 * Use this in iframes that don't have a direct stream connection to background.
 *
 * Messages are sent in the standard ConsoleForwardMessage format so they can
 * be validated with isConsoleForwardMessage on the receiving end.
 *
 * @param source - The source identifier for this context (e.g., 'vat-v1').
 */
export function setupPostMessageConsoleForwarding(source: string): void {
  const originalConsole = { ...console };
  const consoleMethods = ['log', 'debug', 'info', 'warn', 'error'] as const;

  consoleMethods.forEach((consoleMethod) => {
    // eslint-disable-next-line no-console
    console[consoleMethod] = (...args: unknown[]) => {
      originalConsole[consoleMethod](...args);

      // Post to parent window using standard ConsoleForwardMessage format
      const message: ConsoleForwardMessage = {
        jsonrpc: '2.0',
        method: 'console-forward',
        params: {
          source,
          method: consoleMethod,
          args: args.map(stringifyConsoleArg),
        },
      };
      window.parent.postMessage(message, '*');
    };
  });

  harden(globalThis.console);
}
