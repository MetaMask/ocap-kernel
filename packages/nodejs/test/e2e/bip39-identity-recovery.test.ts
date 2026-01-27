import '../../src/env/endoify.ts';

import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { Kernel } from '@metamask/ocap-kernel';
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

// Tests for identity recovery using mnemonic
// Note: These tests verify that the same mnemonic produces the same peer ID
// The peer ID is derived locally from the mnemonic
describe('BIP39 Identity Recovery', () => {
  it(
    'produces same peer ID when initialized with same mnemonic',
    async () => {
      // First kernel with mnemonic
      const kernelDatabase1 = await makeSQLKernelDatabase({
        dbFilename: 'bip39-same-mnemonic-1.db',
      });
      let kernel1: Kernel | undefined;
      let peerId1: string | undefined;

      try {
        kernel1 = await makeTestKernel(kernelDatabase1, true);
        await kernel1.initRemoteComms({
          relays: DUMMY_RELAYS,
          mnemonic: TEST_MNEMONIC,
        });

        const status1 = await kernel1.getStatus();
        expect(status1.remoteComms?.isInitialized).toBe(true);
        peerId1 = status1.remoteComms?.peerId;
        expect(peerId1).toBeDefined();
      } finally {
        if (kernel1) {
          await kernel1.stop();
        }
        kernelDatabase1.close();
      }

      // Create fresh database and kernel with same mnemonic
      const kernelDatabase2 = await makeSQLKernelDatabase({
        dbFilename: 'bip39-same-mnemonic-2.db',
      });
      let kernel2: Kernel | undefined;

      try {
        kernel2 = await makeTestKernel(kernelDatabase2, true);
        await kernel2.initRemoteComms({
          relays: DUMMY_RELAYS,
          mnemonic: TEST_MNEMONIC,
        });

        const status2 = await kernel2.getStatus();
        expect(status2.remoteComms?.isInitialized).toBe(true);
        const peerId2 = status2.remoteComms?.peerId;

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
        dbFilename: 'bip39-diff-mnemonic-1.db',
      });
      let kernel1: Kernel | undefined;
      let peerId1: string | undefined;

      try {
        kernel1 = await makeTestKernel(kernelDatabase1, true);
        await kernel1.initRemoteComms({
          relays: DUMMY_RELAYS,
          mnemonic: TEST_MNEMONIC,
        });

        const status1 = await kernel1.getStatus();
        peerId1 = status1.remoteComms?.peerId;
        expect(peerId1).toBeDefined();
      } finally {
        if (kernel1) {
          await kernel1.stop();
        }
        kernelDatabase1.close();
      }

      // Create kernel with different mnemonic
      const kernelDatabase2 = await makeSQLKernelDatabase({
        dbFilename: 'bip39-diff-mnemonic-2.db',
      });
      let kernel2: Kernel | undefined;

      try {
        kernel2 = await makeTestKernel(kernelDatabase2, true);
        await kernel2.initRemoteComms({
          relays: DUMMY_RELAYS,
          mnemonic: DIFFERENT_MNEMONIC,
        });

        const status2 = await kernel2.getStatus();
        const peerId2 = status2.remoteComms?.peerId;

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
        dbFilename: 'bip39-existing-identity.db',
      });
      let kernel: Kernel | undefined;

      try {
        // First kernel without mnemonic - generates random identity
        kernel = await makeTestKernel(kernelDatabase, true);
        await kernel.initRemoteComms({ relays: DUMMY_RELAYS });

        const status1 = await kernel.getStatus();
        expect(status1.remoteComms?.peerId).toBeDefined();

        // Stop kernel but don't close database
        await kernel.stop();
        kernel = undefined;

        // Create kernel with mnemonic but using existing storage - should throw
        kernel = await makeTestKernel(kernelDatabase, false); // resetStorage = false
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
        dbFilename: 'bip39-invalid-mnemonic.db',
      });
      let kernel: Kernel | undefined;

      try {
        kernel = await makeTestKernel(kernelDatabase, true);

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
});
