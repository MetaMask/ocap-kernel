import { stringify } from '@metamask/kernel-utils';
/**
 * Make an endowment for the fetch API.
 *
 * @param config - The configuration for the fetch endowment.
 * @param config.urls - The URLs which the endowment can fetch.
 * @returns An endowment that provides the fetch API.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function makeFetchEndowment({ urls }: { urls: string[] }) {
  return {
    fetch: harden(async (...[url, ...rest]: Parameters<typeof fetch>) => {
      if (!urls.includes(url as string)) {
        throw new Error(`FetchError: Invalid URL ${stringify(url)}`);
      }
      return fetch(url as string, ...rest);
    }),
  };
}
