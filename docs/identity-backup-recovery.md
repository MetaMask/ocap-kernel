# Kernel Identity Backup and Recovery

The OCAP Kernel supports BIP39 mnemonic phrases for backing up and recovering kernel identity. This enables users to restore their kernel's peer ID on a new device or after data loss.

## Overview

Each kernel has a unique identity derived from a cryptographic seed. This identity determines the kernel's peer ID, which is used for peer-to-peer communication. By default, the kernel generates a random seed on first initialization. With BIP39 support, you can:

- **Create a recoverable identity** by generating a mnemonic and using it during initialization
- **Recover an existing identity** by providing the same mnemonic phrase during initialization

## BIP39 Mnemonic Phrases

A BIP39 mnemonic is a human-readable sequence of words (typically 12 or 24 words) that represents cryptographic entropy. The same mnemonic will always produce the same seed when using the standard PBKDF2 derivation, making it ideal for backup and recovery.

Example 12-word mnemonic:
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

> **Security Note**: Never share your mnemonic phrase. Anyone with access to it can impersonate your kernel identity.

## API Reference

### Utility Functions

The following functions are exported from `@metamask/ocap-kernel`:

#### `generateMnemonic(strength?: 128 | 256): string`

Generates a new random BIP39 mnemonic phrase.

```typescript
import { generateMnemonic } from '@metamask/ocap-kernel';

// Generate 12-word mnemonic (default, 128 bits of entropy)
const mnemonic12 = generateMnemonic();

// Generate 24-word mnemonic (256 bits of entropy)
const mnemonic24 = generateMnemonic(256);
```

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

Converts a BIP39 mnemonic phrase to a 32-byte hex-encoded seed using standard PBKDF2 derivation.

This is a **one-way operation** - you cannot reverse a seed back to its mnemonic. To enable backup/recovery, store the original mnemonic.

```typescript
import { mnemonicToSeed } from '@metamask/ocap-kernel';

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const seed = mnemonicToSeed(mnemonic);
// seed is a 64-character hex string (32 bytes)
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

### Scenario 1: Creating a Recoverable Identity (Recommended)

For new installations where you want backup capability, generate a mnemonic first:

```typescript
import { generateMnemonic, isValidMnemonic } from '@metamask/ocap-kernel';

// Generate and display mnemonic for user to backup
const mnemonic = generateMnemonic();
console.log('Please write down your recovery phrase:');
console.log(mnemonic);

// User confirms they've backed up the mnemonic...

// Initialize kernel with the mnemonic
const kernel = await Kernel.make(platformServices, kernelDatabase, options);
await kernel.initRemoteComms({
  relays,
  mnemonic,
});

// The peer ID is now derived from the mnemonic and can be recovered
const status = await kernel.getStatus();
console.log('Peer ID:', status.remoteComms?.peerId);
```

### Scenario 2: Random Identity (No Backup)

If you don't provide a mnemonic, the kernel generates a random identity that cannot be recovered:

```typescript
// Initialize kernel normally
const kernel = await Kernel.make(platformServices, kernelDatabase, options);

// Initialize remote comms without mnemonic
await kernel.initRemoteComms({ relays });

// Get the peer ID - this identity cannot be backed up as a mnemonic
const status = await kernel.getStatus();
console.log('Peer ID:', status.remoteComms?.peerId);
```

> **Note**: Random seeds cannot be converted to mnemonics. If you need backup capability, use Scenario 1 and generate a mnemonic first.

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

All standard BIP39 mnemonic lengths are supported:

- **12 words** (128 bits of entropy)
- **15 words** (160 bits of entropy)
- **18 words** (192 bits of entropy)
- **21 words** (224 bits of entropy)
- **24 words** (256 bits of entropy)

When generating mnemonics with `generateMnemonic()`, you can choose between 12 words (default) or 24 words.

### PBKDF2 Derivation

This implementation uses standard BIP39 PBKDF2-HMAC-SHA512 derivation (2048 iterations) with an empty passphrase. This ensures compatibility with standard BIP39 test vectors and other implementations.

### Security Best Practices

1. **Generate mnemonic first** - If you need backup capability, always generate a mnemonic before initialization
2. **Never log or transmit mnemonics** - Display only to the user for manual backup
3. **Clear mnemonic from memory** - Don't store in application state longer than necessary
4. **Use secure input methods** - Avoid clipboard operations if possible
5. **Verify before recovery** - Confirm the mnemonic produces the expected peer ID
6. **Store backups securely** - Recommend users write down the phrase offline

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
