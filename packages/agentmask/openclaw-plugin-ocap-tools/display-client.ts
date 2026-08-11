/**
 * Thin client for posting events to the demo-display server. The
 * server's `POST /event` endpoint accepts a JSON body and forwards the
 * event to every connected SSE subscriber.
 *
 * Both toolsets post through it: discovery signals `service.discovered`
 * when a `findServices` reply names a provider, so the marketplace pane
 * renders only providers the agent has actually queried; the
 * orchestration tools post artifact, phase, and wallet events.
 *
 * Errors are logged but never thrown: a transient demo-display outage
 * must not break the agent's tool calls.
 */

export type DisplayClient = {
  post(event: Record<string, unknown>): Promise<void>;
  baseUrl: string;
};

/**
 * Build a display client bound to the demo-display server's base URL.
 *
 * @param options - Construction options.
 * @param options.baseUrl - Base URL of the demo-display server
 *   (e.g. http://127.0.0.1:7777).
 * @param options.timeoutMs - Optional fetch timeout in ms. Default 5000.
 * @returns A client that posts events.
 */
export function makeDisplayClient(options: {
  baseUrl: string;
  timeoutMs?: number;
}): DisplayClient {
  const baseUrl = options.baseUrl.replace(/\/+$/u, '');
  const timeoutMs = options.timeoutMs ?? 5_000;

  return {
    baseUrl,
    async post(event: Record<string, unknown>): Promise<void> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
          signal: controller.signal,
        });
        if (!response.ok) {
          // eslint-disable-next-line no-console
          console.warn(
            `[ocapTools plugin] demo-display rejected event (${response.status})`,
          );
        }
      } catch (error: unknown) {
        // eslint-disable-next-line no-console
        console.warn(
          '[ocapTools plugin] failed to post event to demo-display:',
          error,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
