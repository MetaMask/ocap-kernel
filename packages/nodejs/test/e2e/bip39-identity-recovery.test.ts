import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { Kernel } from '@metamask/ocap-kernel';
import type { KernelStatus } from '@metamask/ocap-kernel';
import { describe, it, expect } from 'vitest';

import { makeTestKernel } from '../helpers/kernel.ts';

// Valid 12-word test mnemonic (DO NOT use in production)
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Different mnemonic for testing different identities
const DIFFERENT_MNEMONIC = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

const TEST_TIMEOUT = 30_000;

// Dummy relay addresses - not actually connected to, just needed for bootstrap
// Using localhost addresses that won't conflict with real relay ports
const DUMMY_RELAYS = ['/ip4/127.0.0.1/tcp/19001/ws/p2p/QmDummyPeerId'];

/**
 * Extract peerId from remoteComms status, returning undefined for disconnected state.
 *
 * @param remoteComms - The remote comms status object.
 * @returns The peer ID string or undefined.
 */
function getRemoteCommsPeerId(
  remoteComms: KernelStatus['remoteComms'],
): string | undefined {
  if (remoteComms && remoteComms.state !== 'disconnected') {
    return remoteComms.peerId;
  }
  return undefined;
}

// Tests for identity recovery using mnemonic
// Note: These tests verify that the same mnemonic produces the same peer ID
// The peer ID is derived locally from the mnemonic
describe('BIP39 Identity Recovery', () => {
  it(
    'produces same peer ID when initialized with same mnemonic',
    async () => {
      // First kernel with mnemonic
      const kernelDatabase1 = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      let kernel1: Kernel | undefined;
      let peerId1: string | undefined;

      try {
        kernel1 = await makeTestKernel(kernelDatabase1);
        await kernel1.initRemoteComms({
          relays: DUMMY_RELAYS,
          mnemonic: TEST_MNEMONIC,
        });

        const status1 = await kernel1.getStatus();
        expect(status1.remoteComms?.state).toBe('connected');
        peerId1 = getRemoteCommsPeerId(status1.remoteComms);
        expect(peerId1).toBeDefined();
      } finally {
        if (kernel1) {
          await kernel1.stop();
        }
        kernelDatabase1.close();
      }

      // Create fresh database and kernel with same mnemonic
      const kernelDatabase2 = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      let kernel2: Kernel | undefined;

      try {
        kernel2 = await makeTestKernel(kernelDatabase2);
        await kernel2.initRemoteComms({
          relays: DUMMY_RELAYS,
          mnemonic: TEST_MNEMONIC,
        });

        const status2 = await kernel2.getStatus();
        expect(status2.remoteComms?.state).toBe('connected');
        const peerId2 = getRemoteCommsPeerId(status2.remoteComms);

        // Peer IDs should be identical
        expect(peerId2).toBe(peerId1);
      } finally {
        if (kernel2) {
          await kernel2.stop();
        }
        kernelDatabase2.close();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'produces different peer ID when initialized with different mnemonic',
    async () => {
      const kernelDatabase1 = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      let kernel1: Kernel | undefined;
      let peerId1: string | undefined;

      try {
        kernel1 = await makeTestKernel(kernelDatabase1);
        await kernel1.initRemoteComms({
          relays: DUMMY_RELAYS,
          mnemonic: TEST_MNEMONIC,
        });

        const status1 = await kernel1.getStatus();
        peerId1 = getRemoteCommsPeerId(status1.remoteComms);
        expect(peerId1).toBeDefined();
      } finally {
        if (kernel1) {
          await kernel1.stop();
        }
        kernelDatabase1.close();
      }

      // Create kernel with different mnemonic
      const kernelDatabase2 = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      let kernel2: Kernel | undefined;

      try {
        kernel2 = await makeTestKernel(kernelDatabase2);
        await kernel2.initRemoteComms({
          relays: DUMMY_RELAYS,
          mnemonic: DIFFERENT_MNEMONIC,
        });

        const status2 = await kernel2.getStatus();
        const peerId2 = getRemoteCommsPeerId(status2.remoteComms);

        // Peer IDs should be different
        expect(peerId2).not.toBe(peerId1);
      } finally {
        if (kernel2) {
          await kernel2.stop();
        }
        kernelDatabase2.close();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'throws error when mnemonic provided but identity already exists in storage',
    async () => {
      const kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      let kernel: Kernel | undefined;

      try {
        // First kernel without mnemonic - generates random identity
        kernel = await makeTestKernel(kernelDatabase);
        await kernel.initRemoteComms({ relays: DUMMY_RELAYS });

        const status1 = await kernel.getStatus();
        expect(getRemoteCommsPeerId(status1.remoteComms)).toBeDefined();

        // Stop kernel but don't close database
        await kernel.stop();
        kernel = undefined;

        // Create kernel with mnemonic but using existing storage - should throw
        kernel = await makeTestKernel(kernelDatabase, { resetStorage: false });
        await expect(
          kernel.initRemoteComms({
            relays: DUMMY_RELAYS,
            mnemonic: TEST_MNEMONIC,
          }),
        ).rejects.toThrow(
          'Cannot use mnemonic: kernel identity already exists. Use resetStorage to clear existing identity first.',
        );
      } finally {
        if (kernel) {
          await kernel.stop();
        }
        kernelDatabase.close();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'throws error for invalid mnemonic',
    async () => {
      const kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      let kernel: Kernel | undefined;

      try {
        kernel = await makeTestKernel(kernelDatabase);

        await expect(
          kernel.initRemoteComms({
            relays: DUMMY_RELAYS,
            mnemonic: 'invalid mnemonic phrase that is not valid',
          }),
        ).rejects.toThrow('Invalid BIP39 mnemonic');
      } finally {
        if (kernel) {
          await kernel.stop();
        }
        kernelDatabase.close();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'allows recovery with resetStorage and mnemonic when identity exists',
    async () => {
      const kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      let kernel: Kernel | undefined;

      try {
        // First kernel without mnemonic - generates random identity
        kernel = await makeTestKernel(kernelDatabase);
        await kernel.initRemoteComms({ relays: DUMMY_RELAYS });

        const status1 = await kernel.getStatus();
        const originalPeerId = getRemoteCommsPeerId(status1.remoteComms);
        expect(originalPeerId).toBeDefined();

        // Stop kernel but don't close database
        await kernel.stop();
        kernel = undefined;

        // Create kernel with resetStorage AND mnemonic - should work
        kernel = await makeTestKernel(kernelDatabase, {
          mnemonic: TEST_MNEMONIC,
        });
        await kernel.initRemoteComms({ relays: DUMMY_RELAYS });

        const status2 = await kernel.getStatus();
        const recoveredPeerId = getRemoteCommsPeerId(status2.remoteComms);

        // Should have new identity from mnemonic, not the original random one
        expect(recoveredPeerId).not.toBe(originalPeerId);
        expect(recoveredPeerId).toBeDefined();

        // Stop and recreate with same mnemonic - should get same peer ID
        await kernel.stop();
        kernel = undefined;

        kernel = await makeTestKernel(kernelDatabase, {
          mnemonic: TEST_MNEMONIC,
        });
        await kernel.initRemoteComms({ relays: DUMMY_RELAYS });

        const status3 = await kernel.getStatus();
        expect(getRemoteCommsPeerId(status3.remoteComms)).toBe(recoveredPeerId);
      } finally {
        if (kernel) {
          await kernel.stop();
        }
        kernelDatabase.close();
      }
    },
    TEST_TIMEOUT,
  );
});
