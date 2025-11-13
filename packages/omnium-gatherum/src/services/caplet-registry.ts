import { Logger } from '@metamask/logger';
import { is } from '@metamask/superstruct';

import type {
  CapletManifest,
  CapletSource,
  CapletRegistryInfo,
} from '../types/caplet.ts';
import { CapletManifestStruct } from '../types/caplet.ts';

const logger = new Logger('caplet-registry');

/**
 * Interface for bundle fetchers that support different sources.
 */
export type BundleFetcher = {
  /**
   * Check if this fetcher can handle the given source.
   *
   * @param source - The source type to check.
   * @param location - The location identifier.
   * @returns True if this fetcher can handle the source.
   */
  canHandle(source: CapletSource, location: string): boolean;

  /**
   * Fetch a bundle from the source.
   *
   * @param location - The location identifier (URL, package name, CID, etc.).
   * @param version - Optional version specifier.
   * @returns The bundle content as a Blob.
   */
  fetchBundle(location: string, version?: string): Promise<Blob>;

  /**
   * Fetch a manifest from the source.
   *
   * @param location - The location identifier.
   * @param version - Optional version specifier.
   * @returns The caplet manifest.
   */
  fetchManifest(location: string, version?: string): Promise<CapletManifest>;
};

/**
 * Bundle fetcher for direct URL sources.
 */
export class UrlBundleFetcher implements BundleFetcher {
  canHandle(source: CapletSource, _location: string): boolean {
    return source === 'url';
  }

  async fetchBundle(location: string): Promise<Blob> {
    logger.log(`Fetching bundle from URL: ${location}`);
    const response = await fetch(location);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch bundle from ${location}: ${response.statusText}`,
      );
    }
    return await response.blob();
  }

  async fetchManifest(location: string): Promise<CapletManifest> {
    logger.log(`Fetching manifest from URL: ${location}`);
    const response = await fetch(location);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch manifest from ${location}: ${response.statusText}`,
      );
    }
    const manifest = await response.json();
    if (!is(manifest, CapletManifestStruct)) {
      throw new Error(`Invalid manifest structure from ${location}`);
    }
    return manifest;
  }
}

/**
 * Bundle fetcher for npm packages.
 */
export class NpmBundleFetcher implements BundleFetcher {
  readonly #npmRegistryUrl: string;

  constructor(npmRegistryUrl = 'https://registry.npmjs.org') {
    this.#npmRegistryUrl = npmRegistryUrl;
  }

  canHandle(source: CapletSource, _location: string): boolean {
    return source === 'npm';
  }

  async fetchBundle(location: string, version = 'latest'): Promise<Blob> {
    logger.log(`Fetching bundle from npm: ${location}@${version}`);

    // First, get package metadata
    const packageUrl = `${this.#npmRegistryUrl}/${location}`;
    const packageResponse = await fetch(packageUrl);
    if (!packageResponse.ok) {
      throw new Error(
        `Failed to fetch npm package ${location}: ${packageResponse.statusText}`,
      );
    }
    const packageData = await packageResponse.json();

    // Resolve version
    const versionData =
      version === 'latest' ? packageData['dist-tags']?.latest : version;
    const versionInfo = packageData.versions?.[versionData];
    if (!versionInfo) {
      throw new Error(`Version ${version} not found for package ${location}`);
    }

    // Fetch the bundle from the tarball URL
    const tarballUrl = versionInfo.dist?.tarball;
    if (!tarballUrl) {
      throw new Error(`No tarball URL found for ${location}@${version}`);
    }

    const bundleResponse = await fetch(tarballUrl);
    if (!bundleResponse.ok) {
      throw new Error(
        `Failed to fetch bundle tarball: ${bundleResponse.statusText}`,
      );
    }

    return await bundleResponse.blob();
  }

  async fetchManifest(
    location: string,
    version = 'latest',
  ): Promise<CapletManifest> {
    logger.log(`Fetching manifest from npm: ${location}@${version}`);

    const packageUrl = `${this.#npmRegistryUrl}/${location}`;
    const packageResponse = await fetch(packageUrl);
    if (!packageResponse.ok) {
      throw new Error(
        `Failed to fetch npm package ${location}: ${packageResponse.statusText}`,
      );
    }
    const packageData = await packageResponse.json();

    // Resolve version
    const versionData =
      version === 'latest' ? packageData['dist-tags']?.latest : version;
    const versionInfo = packageData.versions?.[versionData];
    if (!versionInfo) {
      throw new Error(`Version ${version} not found for package ${location}`);
    }

    // Extract manifest from package.json
    const manifest = versionInfo.capletManifest ?? versionInfo;
    if (!is(manifest, CapletManifestStruct)) {
      throw new Error(
        `Invalid caplet manifest in npm package ${location}@${version}`,
      );
    }

    return manifest;
  }
}

/**
 * Caplet registry service for discovering and fetching caplets.
 */
export class CapletRegistryService {
  readonly #fetchers: BundleFetcher[];

  readonly #registries: string[];

  constructor() {
    this.#fetchers = [new UrlBundleFetcher(), new NpmBundleFetcher()];
    this.#registries = [];
  }

  /**
   * Add a registry URL for discovering caplets.
   *
   * @param url - The registry URL to add.
   */
  addRegistry(url: string): void {
    if (!this.#registries.includes(url)) {
      this.#registries.push(url);
      logger.log(`Added registry: ${url}`);
    }
  }

  /**
   * Remove a registry URL.
   *
   * @param url - The registry URL to remove.
   */
  removeRegistry(url: string): void {
    const index = this.#registries.indexOf(url);
    if (index !== -1) {
      this.#registries.splice(index, 1);
      logger.log(`Removed registry: ${url}`);
    }
  }

  /**
   * Get all registered registry URLs.
   *
   * @returns Array of registry URLs.
   */
  getRegistries(): string[] {
    return [...this.#registries];
  }

  /**
   * Discover caplets from registries.
   *
   * @param registryUrl - Optional specific registry URL to query.
   * @returns Array of discovered caplet manifests.
   */
  async discoverCaplets(registryUrl?: string): Promise<CapletManifest[]> {
    const registries = registryUrl ? [registryUrl] : this.#registries;

    if (registries.length === 0) {
      logger.warn('No registries configured');
      return [];
    }

    const manifests: CapletManifest[] = [];

    for (const url of registries) {
      try {
        logger.log(`Discovering caplets from registry: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
          logger.error(
            `Failed to fetch registry ${url}: ${response.statusText}`,
          );
          continue;
        }
        const data = await response.json();
        const caplets = Array.isArray(data) ? data : (data.caplets ?? []);

        for (const caplet of caplets) {
          if (is(caplet, CapletManifestStruct)) {
            manifests.push(caplet);
          } else {
            logger.warn(`Invalid caplet manifest in registry ${url}`);
          }
        }
      } catch (error) {
        logger.error(`Error discovering caplets from ${url}`, error);
      }
    }

    return manifests;
  }

  /**
   * Fetch a caplet manifest from a source.
   *
   * @param source - The source type (url, npm).
   * @param location - The location identifier.
   * @param version - Optional version specifier.
   * @returns The caplet manifest.
   */
  async fetchCapletManifest(
    source: CapletSource,
    location: string,
    version?: string,
  ): Promise<CapletManifest> {
    const fetcher = this.#fetchers.find((f) => f.canHandle(source, location));
    if (!fetcher) {
      throw new Error(`No fetcher available for source: ${source}`);
    }

    return await fetcher.fetchManifest(location, version);
  }

  /**
   * Fetch a caplet bundle from a source.
   *
   * @param bundleSpec - The bundle specification (URL, npm package, etc.).
   * @param source - Optional source type. If not provided, will be inferred.
   * @param version - Optional version specifier.
   * @returns The bundle content as a Blob.
   */
  async fetchCapletBundle(
    bundleSpec: string,
    source?: CapletSource,
    version?: string,
  ): Promise<Blob> {
    // Infer source if not provided
    let inferredSource: CapletSource = source ?? 'url';
    if (!source) {
      if (bundleSpec.includes('npmjs.org') || !bundleSpec.includes('://')) {
        inferredSource = 'npm';
      } else {
        inferredSource = 'url';
      }
    }

    // Extract location from bundleSpec
    let location = bundleSpec;
    if (inferredSource === 'npm' && bundleSpec.includes('@')) {
      const parts = bundleSpec.split('@');
      location = parts[0] ?? bundleSpec;
      version = version ?? parts[1];
    }

    const fetcher = this.#fetchers.find((f) =>
      f.canHandle(inferredSource, location),
    );
    if (!fetcher) {
      throw new Error(`No fetcher available for source: ${inferredSource}`);
    }

    return await fetcher.fetchBundle(location, version);
  }
}

/**
 * Singleton instance of the caplet registry service.
 */
export const capletRegistryService = new CapletRegistryService();
