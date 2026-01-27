# Kernel Identity Backup and Recovery

The OCAP Kernel supports BIP39 mnemonic phrases for backing up and recovering kernel identity. This enables users to restore their kernel's peer ID on a new device or after data loss.

## Overview

Each kernel has a unique identity derived from a cryptographic seed. This identity determines the kernel's peer ID, which is used for peer-to-peer communication. By default, the kernel generates a random seed on first initialization. With BIP39 support, you can:

- **Recover an existing identity** by providing a mnemonic phrase during initialization
- **Backup your identity** by exporting the seed as a mnemonic phrase

## BIP39 Mnemonic Phrases

A BIP39 mnemonic is a human-readable sequence of words (typically 12 or 24 words) that represents a cryptographic seed. The same mnemonic will always produce the same seed, making it ideal for backup and recovery.

Example 12-word mnemonic:
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

> **Security Note**: Never share your mnemonic phrase. Anyone with access to it can impersonate your kernel identity.

## API Reference

### Utility Functions

The following functions are exported from `@metamask/ocap-kernel`:

#### `isValidMnemonic(mnemonic: string): boolean`

Validates a BIP39 mnemonic phrase.

```typescript
import { isValidMnemonic } from '@metamask/ocap-kernel';

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
if (isValidMnemonic(mnemonic)) {
  console.log('Valid mnemonic');
} else {
  console.log('Invalid mnemonic');
}
```

#### `mnemonicToSeed(mnemonic: string): string`

Converts a BIP39 mnemonic phrase to a 32-byte hex-encoded seed.

```typescript
import { mnemonicToSeed } from '@metamask/ocap-kernel';

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const seed = mnemonicToSeed(mnemonic);
// seed is a 64-character hex string (32 bytes)
```

#### `seedToMnemonic(seedHex: string): string`

Converts a 32-byte hex-encoded seed to a 12-word BIP39 mnemonic phrase. Use this to backup an existing kernel's identity.

```typescript
import { seedToMnemonic } from '@metamask/ocap-kernel';

const seed = '0000000000000000000000000000000000000000000000000000000000000000';
const mnemonic = seedToMnemonic(seed);
// mnemonic is a 12-word phrase
```

### Kernel Initialization with Mnemonic

The `initRemoteComms` method accepts an optional `mnemonic` parameter in its options:

```typescript
await kernel.initRemoteComms({
  relays: ['/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooW...'],
  mnemonic: 'your twelve word mnemonic phrase here ...',
});
```

## Usage Scenarios

### Scenario 1: First-Time Setup with Generated Identity

If you don't provide a mnemonic, the kernel generates a random identity:

```typescript
// Initialize kernel normally
const kernel = await Kernel.make(platformServices, kernelDatabase, options);

// Initialize remote comms without mnemonic
await kernel.initRemoteComms({ relays });

// Get the peer ID
const status = await kernel.getStatus();
console.log('Peer ID:', status.remoteComms?.peerId);
```

### Scenario 2: Backup Your Identity

To backup an existing kernel's identity for future recovery:

```typescript
import { seedToMnemonic } from '@metamask/ocap-kernel';

// The seed is stored in the kernel's KV store under 'keySeed'
// You would typically access this through your application's storage layer
const keySeed = kernelStore.kv.get('keySeed');

if (keySeed) {
  const mnemonic = seedToMnemonic(keySeed);
  console.log('Backup mnemonic:', mnemonic);
  // Store this mnemonic securely (e.g., show to user for manual backup)
}
```

### Scenario 3: Recover Identity on New Device

To restore a kernel's identity using a previously backed-up mnemonic:

```typescript
import { isValidMnemonic } from '@metamask/ocap-kernel';

const mnemonic = 'user provided mnemonic phrase from backup';

// Validate the mnemonic first
if (!isValidMnemonic(mnemonic)) {
  throw new Error('Invalid recovery phrase');
}

// Initialize kernel with fresh storage
const kernel = await Kernel.make(platformServices, kernelDatabase, {
  resetStorage: true,
});

// Initialize remote comms with the recovery mnemonic
await kernel.initRemoteComms({
  relays,
  mnemonic,
});

// The kernel now has the same peer ID as before
const status = await kernel.getStatus();
console.log('Recovered Peer ID:', status.remoteComms?.peerId);
```

### Scenario 4: Verify Recovery Before Migration

To verify a mnemonic will produce the expected peer ID without actually initializing:

```typescript
import { mnemonicToSeed, isValidMnemonic } from '@metamask/ocap-kernel';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { fromHex } from '@metamask/kernel-utils';

async function getPeerIdFromMnemonic(mnemonic: string): Promise<string> {
  if (!isValidMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic');
  }

  const seed = mnemonicToSeed(mnemonic);
  const keyPair = await generateKeyPairFromSeed('Ed25519', fromHex(seed));
  return peerIdFromPrivateKey(keyPair).toString();
}

// Verify before recovery
const expectedPeerId = '12D3KooW...'; // Your known peer ID
const recoveryMnemonic = 'your recovery phrase';

const recoveredPeerId = await getPeerIdFromMnemonic(recoveryMnemonic);
if (recoveredPeerId === expectedPeerId) {
  console.log('Mnemonic verified! Safe to proceed with recovery.');
} else {
  console.log('Warning: This mnemonic produces a different peer ID.');
}
```

## Important Considerations

### Existing Identity Takes Precedence

If the kernel already has a stored identity (from a previous initialization), the mnemonic parameter is ignored. To use a mnemonic for recovery:

1. Use a fresh database, OR
2. Initialize the kernel with `resetStorage: true`

```typescript
// This ensures the mnemonic is used
const kernel = await Kernel.make(platformServices, kernelDatabase, {
  resetStorage: true, // Clears existing identity
});

await kernel.initRemoteComms({
  relays,
  mnemonic: recoveryMnemonic,
});
```

### Mnemonic Validation

Always validate mnemonics before use:

```typescript
import { isValidMnemonic } from '@metamask/ocap-kernel';

if (!isValidMnemonic(userInput)) {
  // Handle invalid mnemonic (wrong words, bad checksum, etc.)
  throw new Error('Please enter a valid 12 or 24-word recovery phrase');
}
```

### Supported Mnemonic Lengths

- **12 words** (128 bits of entropy) - Standard security
- **24 words** (256 bits of entropy) - Enhanced security

Both are supported for recovery. When exporting a seed to mnemonic, a 12-word phrase is generated.

### Security Best Practices

1. **Never log or transmit mnemonics** - Display only to the user for manual backup
2. **Clear mnemonic from memory** - Don't store in application state longer than necessary
3. **Use secure input methods** - Avoid clipboard operations if possible
4. **Verify before recovery** - Confirm the mnemonic produces the expected peer ID
5. **Store backups securely** - Recommend users write down the phrase offline

## Error Handling

```typescript
import { isValidMnemonic, mnemonicToSeed } from '@metamask/ocap-kernel';

try {
  if (!isValidMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  await kernel.initRemoteComms({
    relays,
    mnemonic,
  });
} catch (error) {
  if (error.message === 'Invalid BIP39 mnemonic') {
    // Handle invalid mnemonic
    console.error('The recovery phrase is invalid');
  } else {
    // Handle other errors
    throw error;
  }
}
```
