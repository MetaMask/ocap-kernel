import { useEffect, useState } from 'react';

/**
 * Runtime config served by the demo-display server at
 * `GET /config.json`. Keep the shape narrow: anything the SPA needs
 * that varies by deployment goes here, so the built frontend bundle
 * stays environment-agnostic.
 */
export type DemoDisplayClientConfig = {
  /**
   * URL of a ttyd server fronting an `openclaw tui` session, or
   * `null`/missing when the demo isn't configured to embed the
   * producer dialog.
   */
  ttydUrl: string | null;
};

/**
 * Fetch `/config.json` once on mount and return the parsed payload.
 *
 * Returns `undefined` until the first fetch settles. On failure
 * (network error, malformed JSON), returns a config with everything
 * null so the SPA renders the unconfigured fallback rather than
 * blocking on the request.
 *
 * @returns The parsed config, or `undefined` while loading.
 */
export function useConfig(): DemoDisplayClientConfig | undefined {
  const [config, setConfig] = useState<DemoDisplayClientConfig | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/config.json')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`config.json fetch failed: ${response.status}`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((raw) => {
        if (!cancelled) {
          setConfig(normalizeConfig(raw));
        }
        return undefined;
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setConfig({ ttydUrl: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}

/**
 * Coerce a parsed `/config.json` body into the SPA's typed shape,
 * tolerating either missing fields or stale server versions that emit
 * extra ones.
 *
 * @param raw - The parsed JSON body.
 * @returns The normalized client config.
 */
function normalizeConfig(raw: unknown): DemoDisplayClientConfig {
  if (raw === null || typeof raw !== 'object') {
    return { ttydUrl: null };
  }
  const record = raw as Record<string, unknown>;
  const ttydUrl =
    typeof record.ttydUrl === 'string' && record.ttydUrl.length > 0
      ? record.ttydUrl
      : null;
  return { ttydUrl };
}
