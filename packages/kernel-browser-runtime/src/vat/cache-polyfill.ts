type KnownRemotes = Record<string, () => Promise<unknown>>;

class FileUrlCache {
  readonly #cache: Map<string, Response>;

  readonly #knownRemotes: KnownRemotes;

  constructor(knownRemotes: KnownRemotes) {
    this.#cache = new Map();
    this.#knownRemotes = knownRemotes;
  }

  isValidFileUrl(url: string) {
    const fileUrlPattern = /^file:\/\/.*$/u;
    return fileUrlPattern.test(url);
  }

  isKnownRemote(url: string): url is keyof KnownRemotes {
    return url in this.#knownRemotes;
  }

  async fetchKnownRemote(url: string): Promise<Response> {
    const response = await this.#knownRemotes[url]?.();
    if (!response) {
      throw new Error(`Unknown remote: ${url}`);
    }
    return new Response(response as ArrayBuffer);
  }

  // Helper: Normalize the URL (to ensure consistency)
  normalizeUrl(url: string | URL) {
    try {
      return new URL(url).href;
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  // Match a request in the cache
  async match(request: string | Request) {
    const url = this.normalizeUrl((request as Request).url ?? request);
    if (this.isKnownRemote(url)) {
      return await this.fetchKnownRemote(url);
    }
    if (!this.isValidFileUrl(url)) {
      return undefined;
    }
    return this.#cache.get(url) || undefined;
  }

  // Match all requests in the cache
  async matchAll(request: string | Request) {
    if (!request) {
      // Return all cached responses if no request is provided
      return Array.from(this.#cache.values());
    }
    const url = this.normalizeUrl((request as Request).url ?? request);
    if (this.isKnownRemote(url)) {
      return [await this.fetchKnownRemote(url)];
    }
    if (!this.isValidFileUrl(url)) {
      return [];
    }
    return this.#cache.has(url) ? [this.#cache.get(url)] : [];
  }

  // Add a single request to the cache
  async add(request: string | Request) {
    const url = this.normalizeUrl((request as Request).url ?? request);
    if (this.isKnownRemote(url)) {
      return;
    }
    if (!this.isValidFileUrl(url)) {
      throw new Error(
        `Invalid URL: Only 'file://' URLs are allowed. Got: ${url}`,
      );
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${url}`);
    }
    this.#cache.set(url, response.clone());
  }

  // Add multiple requests to the cache
  async addAll(requests: (string | Request)[]) {
    const promises = requests.map(async (request) => this.add(request));
    await Promise.all(promises);
  }

  // Put a request-response pair into the cache
  async put(request: string | Request, response: Response) {
    const url = this.normalizeUrl((request as Request).url ?? request);
    if (this.isKnownRemote(url)) {
      return;
    }
    if (!this.isValidFileUrl(url)) {
      throw new Error(`Invalid URL: Only 'file://' URLs are allowed.`);
    }
    this.#cache.set(url, response.clone());
  }

  // Delete a request from the cache
  async delete(request: string | Request) {
    const url = this.normalizeUrl((request as Request).url ?? request);
    if (this.isKnownRemote(url)) {
      return false;
    }
    if (!this.isValidFileUrl(url)) {
      return false;
    }
    return this.#cache.delete(url);
  }

  // Get all keys (requests) in the cache
  async keys() {
    return [
      ...Object.keys(this.#knownRemotes),
      ...Array.from(this.#cache.keys()),
    ].map((url) => new Request(url));
  }
}

export const makeCaches = (knownRemotes: KnownRemotes) => {
  const cache = new FileUrlCache(knownRemotes);
  return {
    open: async (_cache: string) => cache,
  };
};
