import type { Logger } from '@metamask/logger';
import type { Json } from '@metamask/utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { echoCapletManifest } from './fixtures/manifests.ts';
import { makeMockStorageAdapter } from './utils.ts';
import { CapletController } from '../src/controllers/caplet/caplet-controller.ts';
import type {
  CapletControllerFacet,
  CapletControllerDeps,
} from '../src/controllers/caplet/caplet-controller.ts';

const makeMockLogger = (): Logger => {
  const mockLogger = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    subLogger: vi.fn(() => mockLogger),
  } as unknown as Logger;
  return mockLogger;
};

describe('Caplet Integration - Echo Caplet', () => {
  let capletController: CapletControllerFacet;
  let mockStorage: Map<string, Json>;
  let mockSubclusterCounter: number;

  beforeEach(async () => {
    // Reset state
    mockStorage = new Map();
    mockSubclusterCounter = 0;

    // Create a mock logger
    const mockLogger = makeMockLogger();
    // Create a mock storage adapter
    const mockAdapter = makeMockStorageAdapter(mockStorage);

    // Create mock kernel functions
    const mockLaunchSubcluster = vi.fn(async () => {
      mockSubclusterCounter += 1;
      return {
        subclusterId: `test-subcluster-${mockSubclusterCounter}`,
        rootKref: `ko${mockSubclusterCounter}`,
      };
    });

    const mockTerminateSubcluster = vi.fn(async () => {
      // No-op for tests
    });

    const mockGetVatRoot = vi.fn(async (krefString: string) => {
      // In real implementation, this returns a CapTP presence
      // For tests, we return a mock object
      return { kref: krefString };
    });

    const deps: CapletControllerDeps = {
      adapter: mockAdapter,
      launchSubcluster: mockLaunchSubcluster,
      terminateSubcluster: mockTerminateSubcluster,
      getVatRoot: mockGetVatRoot,
    };

    // Create the caplet controller using static make() method
    capletController = await CapletController.make(
      { logger: mockLogger },
      deps,
    );
  });

  it('installs echo-caplet successfully', async () => {
    const result = await capletController.install(echoCapletManifest);

    expect(result.capletId).toBe('com.example.echo');
    expect(result.subclusterId).toBe('test-subcluster-1');
  });

  it('retrieves installed echo-caplet', async () => {
    await capletController.install(echoCapletManifest);

    const caplet = await capletController.get('com.example.echo');

    expect(caplet).toStrictEqual({
      manifest: {
        id: 'com.example.echo',
        name: 'Echo Service',
        version: '1.0.0',
        bundleSpec: expect.anything(),
        requestedServices: [],
        providedServices: ['echo'],
      },
      subclusterId: 'test-subcluster-1',
      rootKref: 'ko1',
      installedAt: expect.any(Number),
    });
  });

  it('lists all installed caplets', async () => {
    const emptyList = await capletController.list();
    expect(emptyList).toHaveLength(0);

    await capletController.install(echoCapletManifest);

    const list = await capletController.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.manifest.id).toBe('com.example.echo');
  });

  it('finds caplet by service name', async () => {
    const notFound = await capletController.getByService('echo');
    expect(notFound).toBeUndefined();

    await capletController.install(echoCapletManifest);

    const provider = await capletController.getByService('echo');
    expect(provider).toBeDefined();
    expect(provider?.manifest.id).toBe('com.example.echo');
  });

  it('uninstalls echo-caplet cleanly', async () => {
    // Install
    await capletController.install(echoCapletManifest);

    let list = await capletController.list();
    expect(list).toHaveLength(1);

    // Uninstall
    await capletController.uninstall('com.example.echo');

    list = await capletController.list();
    expect(list).toHaveLength(0);

    // Verify it's also gone from get() and getByService()
    const caplet = await capletController.get('com.example.echo');
    expect(caplet).toBeUndefined();

    const provider = await capletController.getByService('echo');
    expect(provider).toBeUndefined();
  });

  it('prevents duplicate installations', async () => {
    await capletController.install(echoCapletManifest);

    // Attempting to install again should throw
    await expect(capletController.install(echoCapletManifest)).rejects.toThrow(
      'already installed',
    );
  });

  it('handles uninstalling non-existent caplet', async () => {
    await expect(
      capletController.uninstall('com.example.nonexistent'),
    ).rejects.toThrow('not found');
  });

  it('gets caplet root object as presence', async () => {
    await capletController.install(echoCapletManifest);

    const rootPresence =
      await capletController.getCapletRoot('com.example.echo');

    // The presence should be the object returned by getVatRoot mock
    expect(rootPresence).toStrictEqual({ kref: 'ko1' });
  });

  it('throws when getting root for non-existent caplet', async () => {
    await expect(
      capletController.getCapletRoot('com.example.nonexistent'),
    ).rejects.toThrow('not found');
  });

  it('persists caplet state across controller restarts', async () => {
    // Install a caplet
    await capletController.install(echoCapletManifest);

    // Simulate a restart by creating a new controller with the same storage
    const mockLogger = makeMockLogger();

    const newDeps: CapletControllerDeps = {
      adapter: makeMockStorageAdapter(mockStorage),
      launchSubcluster: vi.fn(async () => ({
        subclusterId: 'test-subcluster',
        rootKref: 'ko1',
      })),
      terminateSubcluster: vi.fn(),
      getVatRoot: vi.fn(async (krefString: string) => ({ kref: krefString })),
    };

    const newController = await CapletController.make(
      { logger: mockLogger },
      newDeps,
    );

    // The caplet should still be there
    const list = await newController.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.manifest.id).toBe('com.example.echo');
  });
});
