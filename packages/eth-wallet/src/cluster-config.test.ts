import { describe, it, expect } from 'vitest';

import { makeWalletClusterConfig } from './cluster-config.ts';
import type { Address } from './types.ts';

const BUNDLE_BASE_URL = 'http://localhost:3000';

describe('cluster-config', () => {
  describe('makeWalletClusterConfig', () => {
    it('creates a valid ClusterConfig', () => {
      const config = makeWalletClusterConfig({
        bundleBaseUrl: BUNDLE_BASE_URL,
      });

      expect(config.bootstrap).toBe('coordinator');
      expect(config.forceReset).toBe(true);
      expect(config.vats).toHaveProperty('coordinator');
      expect(config.vats).toHaveProperty('keyring');
      expect(config.vats).toHaveProperty('provider');
      expect(config.vats).toHaveProperty('delegation');
    });

    it('includes OCAP URL services by default', () => {
      const config = makeWalletClusterConfig({
        bundleBaseUrl: BUNDLE_BASE_URL,
      });

      expect(config.services).toStrictEqual([
        'ocapURLIssuerService',
        'ocapURLRedemptionService',
      ]);
    });

    it('allows custom services', () => {
      const config = makeWalletClusterConfig({
        bundleBaseUrl: BUNDLE_BASE_URL,
        services: ['customService'],
      });

      expect(config.services).toStrictEqual(['customService']);
    });

    it('sets delegation manager address as parameter', () => {
      const address = '0xcccccccccccccccccccccccccccccccccccccccc' as Address;
      const config = makeWalletClusterConfig({
        bundleBaseUrl: BUNDLE_BASE_URL,
        delegationManagerAddress: address,
      });

      expect(config.vats.delegation).toHaveProperty('parameters');
      expect(
        (config.vats.delegation as { parameters: Record<string, unknown> })
          .parameters.delegationManagerAddress,
      ).toBe(address);
    });

    it('has four vats with bundleSpec', () => {
      const config = makeWalletClusterConfig({
        bundleBaseUrl: BUNDLE_BASE_URL,
      });
      const vatNames = Object.keys(config.vats);

      expect(vatNames).toStrictEqual([
        'coordinator',
        'keyring',
        'provider',
        'delegation',
      ]);

      for (const vatName of vatNames) {
        const vatConfig = config.vats[vatName] as { bundleSpec: string };
        expect(vatConfig).toHaveProperty('bundleSpec');
        expect(vatConfig.bundleSpec).toBe(
          `${BUNDLE_BASE_URL}/${vatName}-vat.bundle`,
        );
      }
    });

    it('requests required globals for all vats', () => {
      const config = makeWalletClusterConfig({
        bundleBaseUrl: BUNDLE_BASE_URL,
      });

      const baseGlobals = ['TextEncoder', 'TextDecoder'];
      for (const vatName of ['keyring', 'provider', 'delegation']) {
        const vatConfig = config.vats[vatName] as { globals?: string[] };
        expect(vatConfig.globals).toStrictEqual(baseGlobals);
      }

      // Coordinator additionally needs Date (SDK uses Date.now at import)
      const coordConfig = config.vats.coordinator as { globals?: string[] };
      expect(coordConfig.globals).toStrictEqual([
        'TextEncoder',
        'TextDecoder',
        'Date',
      ]);
    });

    it('defaults forceReset to true', () => {
      const config = makeWalletClusterConfig({
        bundleBaseUrl: BUNDLE_BASE_URL,
      });
      expect(config.forceReset).toBe(true);
    });

    it('respects forceReset false', () => {
      const config = makeWalletClusterConfig({
        bundleBaseUrl: BUNDLE_BASE_URL,
        forceReset: false,
      });
      expect(config.forceReset).toBe(false);
    });

    it('designates coordinator as the bootstrap vat', () => {
      const config = makeWalletClusterConfig({
        bundleBaseUrl: BUNDLE_BASE_URL,
      });
      expect(config.bootstrap).toBe('coordinator');
      expect(config.vats).toHaveProperty(config.bootstrap);
    });
  });
});
