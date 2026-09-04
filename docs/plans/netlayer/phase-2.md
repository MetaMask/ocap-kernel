# Phase 2 — Neutral Identity + Kernel De-libp2p-ing

Implementation plan for Phase 2 of the pluggable-netlayer effort. See the master
plan ([`master.md`](./master.md))
for full context. This document is self-contained and executable by an engineer
with no prior context.

## 0. Assumptions carried from Phase 1

> **Revision required before execution.** This plan was written before Phase 1 landed.
> Reconcile every Phase-1 reference below (names, signatures, line numbers) against the
> actually-merged code; where they differ, the landed code wins and this document should be
> updated, not followed blindly.

Phase 1 (already merged before this work starts) delivered, in `ocap-kernel` only:

- `Channel` replaced by `NetworkChannel` (`{ peerId, read, write, close,
setInactivityTimeout }`); `ConnectionFactory` produces `NetworkChannel`s, with
  `lpStream` wrapping, inactivity timeout, and raw-error → neutral-error mapping
  now living _inside_ `ConnectionFactory`.
- Neutral error classes exist in `@metamask/kernel-errors`: `ChannelResetError`,
  `IntentionalDisconnectError`, `MessageTooLargeError`. Per the Phase 1 plan, the
  mapper covers the **read path only** (`InvalidDataLength*` → `MessageTooLargeError`,
  `StreamResetError` → `ChannelResetError`, SCTP user-abort →
  `IntentionalDisconnectError`); dial-path errors such as `MuxerClosedError` are
  **not** mapped and still surface raw. This matters for §3.5 below.
- `transport.ts` is libp2p-import-free (consumes only `NetworkChannel` /
  `ChannelProvider`).

Where a statement below depends on a Phase 1 rename (e.g. `Channel.peerId` is now
`NetworkChannel.peerId`), it is flagged inline. If Phase 1 named a class or field
differently, adjust the reference — the design is unchanged.

Everything else described here reflects the code as it exists on `main` today.

---

## 1. Objective and non-goals

### Objective

Make the kernel's peer identity **netlayer-neutral** and remove libp2p and
libp2p-specific crypto from the kernel's identity/URL/error layer:

1. Derive the peerId as **multibase base58btc of the raw 32-byte Ed25519 public
   key** via `@noble/curves`, replacing `@libp2p/crypto/keys`
   `generateKeyPairFromSeed` + `@libp2p/peer-id` `peerIdFromPrivateKey` in
   `remotes/kernel/remote-comms.ts`. The persisted `keySeed` is unchanged (still a
   32-byte hex seed).
2. Replace `@libp2p/crypto/ciphers` `AES_GCM` (ocap-URL oid encryption) with
   WebCrypto `crypto.subtle` AES-256-GCM, which runs in both the kernel worker and
   Node.
3. Add **neutral-id ↔ libp2p-peerId conversion at the libp2p boundary** in
   `remotes/platform/connection-factory.ts` so the kernel/transport layer only
   ever sees neutral ids while libp2p continues to speak its own PeerIds on the
   wire.
4. Drop `@libp2p/interface` from `@metamask/kernel-errors`
   (`isRetryableNetworkError`), leaning on the Phase 1 neutral error classes.
5. Change the `ocap:{oid}@{host},{hints}` URL host encoding to the neutral id.

### Non-goals

- **No new packages.** `@metamask/netlayer` and the impl packages arrive in
  Phases 3–4. The neutral-identity helper lives in `ocap-kernel` this phase and
  _moves_ to `@metamask/netlayer` in Phase 3.
- **No removal of libp2p transport deps.** `ConnectionFactory` still creates a
  libp2p node from the seed and still dials multiaddrs. Most `@libp2p/*` deps in
  `ocap-kernel/package.json` stay until Phase 4 (see §4).
- **No crypto-surface expansion.** We _swap primitives_ (libp2p AES-GCM →
  WebCrypto AES-GCM; libp2p Ed25519 keygen → noble Ed25519 pubkey derivation). We
  do not add signing, handshake auth, or new key types. The existing
  "XXX IMPORTANT: All the cryptography here is completely amateur…" warning in
  `remote-comms.ts` stays and still applies; carry it forward verbatim.
- **No migration.** Persisted `peerId` and any previously issued `ocap:` URLs
  become invalid across this change. This is explicitly allowed (pre-1.0, user
  decision #3). Verification uses fresh storage.

---

## 2. Neutral identity design

### Encoding

- **Seed** (`keySeed`): unchanged — 32-byte Ed25519 seed, hex-encoded string, as
  persisted today and as produced by `mnemonicToSeed` (first 32 bytes of the
  BIP39 PBKDF2-HMAC-SHA512 output). No change to `utils/bip39.ts`.
- **Raw public key**: `ed25519.getPublicKey(seedBytes)` → 32 bytes. Ed25519
  pubkey derivation is deterministic from the seed and identical to what
  `@libp2p/crypto`'s `generateKeyPairFromSeed('Ed25519', seed)` derives internally
  (both are noble-based), so the _same seed yields the same raw pubkey_ — this is
  what preserves mnemonic recovery.
- **Neutral peerId**: `base58btc.encode(rawPublicKey)` from
  `multiformats/bases/base58`. This is a **multibase** string with the `z` prefix
  (e.g. `z6Mk…`). Contrast with today's libp2p peerId (`12D3KooW…`, base58btc of
  an identity _multihash_, no multibase prefix). The base58 alphabet contains no
  `@` or `,`, so it is safe inside the `ocap:` URL host slot.

### Helper: location and signature

New file `packages/ocap-kernel/src/remotes/kernel/identity.ts` (libp2p-free;
`@noble/curves` + `multiformats` only). In Phase 3 this file moves wholesale to
`@metamask/netlayer` and is re-exported from `ocap-kernel`.

```ts
import { ed25519 } from '@noble/curves/ed25519';
import { base58btc } from 'multiformats/bases/base58';

/** Length in bytes of a raw Ed25519 public key. */
const ED25519_PUBLIC_KEY_LENGTH = 32;

/**
 * Derive a netlayer-neutral peer id from a raw Ed25519 seed.
 *
 * @param seed - The 32-byte Ed25519 seed.
 * @returns The neutral peer id: multibase (base58btc) of the raw public key.
 */
export function deriveNeutralPeerId(seed: Uint8Array): string {
  const publicKey = ed25519.getPublicKey(seed);
  return base58btc.encode(publicKey);
}

/**
 * Recover the raw Ed25519 public key from a neutral peer id.
 *
 * @param peerId - A neutral peer id produced by {@link deriveNeutralPeerId}.
 * @returns The raw 32-byte public key.
 * @throws if `peerId` is not a base58btc multibase string of the right length.
 */
export function neutralPeerIdToPublicKey(peerId: string): Uint8Array {
  const raw = base58btc.decode(peerId);
  if (raw.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw Error(`invalid neutral peer id length: ${raw.length}`);
  }
  return raw;
}

/**
 * Encode a raw Ed25519 public key as a neutral peer id.
 *
 * @param publicKey - The raw 32-byte public key.
 * @returns The neutral peer id.
 */
export function publicKeyToNeutralPeerId(publicKey: Uint8Array): string {
  return base58btc.encode(publicKey);
}
```

`deriveNeutralPeerId` / `publicKeyToNeutralPeerId` are the same operation on
different inputs; keep both for call-site clarity. `harden` the module's exports
per repo convention if a barrel wraps them; these are plain functions so no
`harden(this)` applies.

Export the helper from the package barrel (`packages/ocap-kernel/src/index.ts`)
so `kernel-test` (and the recovery doc) can reuse it instead of re-deriving with
libp2p. Grep the barrel for the existing `mnemonicToSeed`/`generateMnemonic`
re-exports and add `deriveNeutralPeerId` (and `neutralPeerIdToPublicKey` if the
doc's verify-before-recovery snippet wants it) alongside.

---

## 3. File-by-file change list

### 3.1 `remotes/kernel/remote-comms.ts` — identity derivation

Remove imports:

```ts
import { AES_GCM } from '@libp2p/crypto/ciphers';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
```

Add:

```ts
import { deriveNeutralPeerId } from './identity.ts';
```

Rewrite `generateKeyInfo` (currently lines ~106–112):

```ts
async function generateKeyInfo(seedString?: string): Promise<[string, string]> {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins, no-param-reassign
  seedString ??= toHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  const peerId = deriveNeutralPeerId(fromHex(seedString));
  return [seedString, peerId];
}
```

`generateKeyInfo` can now be synchronous internally, but keep the `async`
signature (it is `await`ed at the call site and staying async minimizes churn and
keeps the door open for a future async KDF).

### 3.2 `remotes/kernel/remote-comms.ts` — AES-GCM → WebCrypto

Today's `AES_GCM.create()` (from `@libp2p/crypto/ciphers`) treats `ocapURLKey`
(32 random bytes) as a _password_, runs PBKDF2 (32767 iterations, 16-byte salt) to
derive a 16-byte AES-128 key, and produces `salt(16) ‖ nonce(12) ‖ ct ‖ tag(16)`.
We replace this with `ocapURLKey` used **directly** as a 256-bit AES-GCM key
(no PBKDF2 — the key is already 32 random bytes, so password stretching adds
nothing), random 12-byte IV, output `iv(12) ‖ ct+tag`. This is a **wire-format
change** to the oid; acceptable (no migration).

Import the key once during init (both branches of the `ocapURLKey`
load/generate logic converge on a `Uint8Array`; import right after, replacing the
`const cipher = AES_GCM.create();` line at ~240):

```ts
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const aesKey = await globalThis.crypto.subtle.importKey(
  'raw',
  ocapURLKey,
  { name: 'AES-GCM' },
  false,
  ['encrypt', 'decrypt'],
);

const AES_GCM_IV_LENGTH = 12;
```

`issueOcapURL` — replace `const rawOid = await cipher.encrypt(encodedKref,
ocapURLKey);` (~264) with:

```ts
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const iv = globalThis.crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const ciphertext = new Uint8Array(
  await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encodedKref,
  ),
);
const rawOid = new Uint8Array(iv.length + ciphertext.length);
rawOid.set(iv, 0);
rawOid.set(ciphertext, iv.length);
const oid = base58btc.encode(rawOid);
```

`redeemLocalOcapURL` — replace the `cipher.decrypt` block (~344–351) with:

```ts
const rawOid = base58btc.decode(oid);
let encodedKref: Uint8Array;
try {
  const iv = rawOid.subarray(0, AES_GCM_IV_LENGTH);
  const ciphertext = rawOid.subarray(AES_GCM_IV_LENGTH);
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  encodedKref = new Uint8Array(
    await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext,
    ),
  );
} catch (problem) {
  logger?.error(`problem deciphering encoded kref: `, problem);
  throw Error(`ocapURL has bad object reference`);
}
```

Keep the existing `KREF_MIN_LEN` (16) padding/trimming — it still avoids leaking
kref length, and WebCrypto's GCM auth tag is appended to the ciphertext
automatically, so no separate tag handling is needed. Keep the amateur-crypto
warning comment. Update the stale inline comment "the libp2p AESCipher salts the
plaintext…" to note that the random 12-byte IV per encryption provides the
semantic security here.

Note: `globalThis.crypto.subtle` is available in the kernel worker and in Node ≥
20 (already the runtime floor; `globalThis.crypto.getRandomValues` is already used
in this file). Add the `n/no-unsupported-features/node-builtins` eslint disables
shown above, mirroring the existing ones.

### 3.3 `remotes/platform/connection-factory.ts` — id conversion at the libp2p boundary

The kernel/transport layer passes **neutral** ids into `dial` and reads
**neutral** ids off inbound channels; libp2p internally needs libp2p PeerIds
(both for `dialProtocol` targets embedded in `/p2p/<id>` multiaddrs and for
`connection.remotePeer`). Convert at exactly two points.

Add imports:

```ts
import { publicKeyFromRaw } from '@libp2p/crypto/keys';
import { peerIdFromPublicKey } from '@libp2p/peer-id';
import {
  neutralPeerIdToPublicKey,
  publicKeyToNeutralPeerId,
} from '../kernel/identity.ts';
```

Add two private helpers:

```ts
/**
 * Convert a neutral peer id to the libp2p PeerId string used inside multiaddrs.
 *
 * @param neutralId - The neutral (base58btc raw-pubkey) peer id.
 * @returns The libp2p PeerId string.
 */
#toLibp2pPeerId(neutralId: string): string {
  const publicKey = publicKeyFromRaw(neutralPeerIdToPublicKey(neutralId));
  return peerIdFromPublicKey(publicKey).toString();
}
```

For the inbound direction, `connection.remotePeer` is an `Ed25519PeerId` whose
`.publicKey.raw` is the 32-byte raw key (`@libp2p/interface` guarantees
`Ed25519PublicKey.raw`). Convert with `publicKeyToNeutralPeerId`.

Wiring changes:

1. **`dial` / `dialIdempotent` / `openChannelOnce` / `openChannelWithRetry`.**
   These take `peerId` (currently the libp2p id) and pass it to
   `candidateAddressStrings`, which builds `${relay}/p2p-circuit/webrtc/p2p/${peerId}`
   and compares direct hints via `getLastPeerId(multiaddr(hint)) === peerId`
   (multiaddrs embed **libp2p** ids). After Phase 2 the _incoming_ `peerId` is
   neutral, so convert **once at the top of the public entry point** (`dial`, or
   `dialIdempotent` per the Phase 1 shape) to the libp2p id and thread the libp2p
   id through `candidateAddressStrings`/`openChannel*` unchanged. Keep the
   `#inflightDials` map keyed by the **neutral** id (that is what the transport
   layer knows and what `closeConnection` receives), converting to libp2p id only
   for the dial itself.
2. **Returned channel's `peerId`.** Wherever `openChannelOnce` builds the channel
   (`{ msgStream, stream, peerId }` today; a `NetworkChannel` after Phase 1), set
   `.peerId` to the **neutral** id the caller passed in — not the libp2p id.
   Since `dial` already holds the neutral id, pass it down or re-attach it to the
   returned channel.
3. **Inbound handler** (`this.#libp2p.handle('whatever', …)`, ~226). Replace
   `const remotePeerId = connection.remotePeer.toString();` with:
   ```ts
   const remotePeerId = publicKeyToNeutralPeerId(
     connection.remotePeer.publicKey.raw,
   );
   ```
   so the inbound `NetworkChannel.peerId` is neutral. (`connection.remotePeer` is
   an Ed25519 peer for our noise-authenticated Ed25519 peers; if `.publicKey` is
   ever absent, log and drop the connection rather than fabricate an id.)
4. **`peer:disconnect` / `connection:close` handlers** (~255–274). `evt.detail`
   is a libp2p PeerId (or its string). The `#relayPeerIds` set holds **relay**
   libp2p ids (relays are opaque hint strings, unchanged), so the
   `#relayPeerIds.has(...)` guard stays in libp2p-id space. But the id forwarded
   to `#disconnectHandler` (the transport's `onPeerDisconnect`) **must be
   neutral**. Convert `evt.detail.publicKey.raw` → neutral before calling
   `this.#disconnectHandler?.(neutralId)`. Relay disconnects are still suppressed
   as today.
5. **`getListenAddresses`** (~317) is unchanged — it returns libp2p multiaddr
   strings, which remain netlayer-specific opaque hint strings.
6. **`#generateKeyInfo`** (~329) stays exactly as is — libp2p's node still needs a
   libp2p `PrivateKey` from the seed. This is the one remaining libp2p keygen call
   in `ocap-kernel` and it is legitimately libp2p's own concern; it moves to
   `@metamask/netlayer-libp2p` in Phase 4.

Do **not** touch `utils/multiaddr.ts` (`getLastPeerId`, `getHost`, `isPlainWs`) —
those parse relay/direct multiaddrs, which stay in libp2p-id space. This is the
subtle point in the master plan's risk list: peerIds parsed _out of multiaddrs_
are libp2p ids and must keep being compared against the libp2p-converted target
id, which is exactly why the conversion happens _before_ `candidateAddressStrings`
(step 1) and nowhere inside the multiaddr utils.

### 3.4 `remotes/kernel/OcapURLManager.ts`

No functional change. `parseOcapURL`'s `host` comparison
(`host === identity.getPeerId()`) now compares neutral ids on both sides —
`getPeerId()` returns the neutral id and the URL host is the neutral id — so it
still works. No edit needed beyond confirming via the round-trip tests.

### 3.5 `@metamask/kernel-errors` — drop `@libp2p/interface`

`packages/kernel-errors/src/utils/isRetryableNetworkError.ts`:

- Remove `import { MuxerClosedError } from '@libp2p/interface';` and the
  `if (error instanceof MuxerClosedError) return true;` branch.
- **Behavior preservation — do not skip.** Phase 1's mapper covers the read path only;
  `MuxerClosedError` arises on the **dial path** and is not mapped to a neutral class,
  so simply deleting the branch would change retry classification. Preserve behavior
  without the import by classifying it by name, consistent with the file's existing
  name-sniffing style:
  ```ts
  if (error instanceof Error && error.name === 'MuxerClosedError') {
    return true;
  }
  ```
  (Alternative, if Phase 1's landed mapper turns out to cover dial-path errors after
  all: match on the neutral class instead. Check the merged Phase 1 code first.)
- Add a case for the Phase 1 neutral class (adjust the import path to wherever Phase 1
  placed it, e.g. `../errors/ChannelResetError.ts` or the package barrel):
  ```ts
  import { ChannelResetError } from '../errors/index.ts';
  // …
  if (error instanceof ChannelResetError) {
    return true;
  }
  ```
  so mapped read-path resets remain retryable once callers start seeing the neutral
  classes.
- **Keep** the Node.js `code` checks (`ECONNRESET`, `ETIMEDOUT`, …), the
  `name.includes('Dial')/('Transport')` string sniffing, and the `NO_RESERVATION`
  message check. These are string/duck-typed (no libp2p import) and still catch
  raw libp2p dial errors that surface before Phase 1's mapping. Add a code comment
  that the `MuxerClosedError`/`Dial`/`Transport`/`NO_RESERVATION` branches are
  libp2p-specific and move to `@metamask/netlayer-libp2p`'s error mapper in Phase 4.
- `packages/kernel-errors/package.json`: remove `"@libp2p/interface": "3.1.1"`.
  This was its **only** libp2p usage (confirmed: `grep -rn "@libp2p"
packages/kernel-errors/src` returns only `isRetryableNetworkError.ts` and its
  test). Remove the corresponding `references` entry only if one exists (it is an
  external dep, so likely none).
- Update `isRetryableNetworkError.test.ts`: drop the `MuxerClosedError` import;
  add a case constructing a `ChannelResetError` and asserting retryable, and a case
  for a plain `Error` with `name = 'MuxerClosedError'` asserting it stays retryable
  (the name-based branch above). Keep the Node-code and name-sniffing cases.

### 3.6 Test-helper and test updates

- **`packages/ocap-kernel/src/remotes/kernel/remote-comms.test.ts`.** Replace the
  three (four) blocks computing the expected peerId via
  `generateKeyPairFromSeed` + `peerIdFromPrivateKey` (lines ~90–94, ~283–287,
  ~399–403, ~1178–1182) with `deriveNeutralPeerId(fromHex(keySeed))`. Drop the
  `@libp2p/crypto/keys` and `@libp2p/peer-id` imports (lines 1–2). The
  corrupt-oid test (~962) still constructs a valid-base58btc/invalid-ciphertext
  oid — it stays valid because base58btc encoding is unchanged; only assert it
  still rejects with `ocapURL has bad object reference`. Add explicit
  round-trip and vector tests per §6.
- **`packages/kernel-test/src/remote-comms.test.ts`.** The `DirectNetwork` fake
  platform-services derives `actualPeerId` from `keySeed` via libp2p (lines
  ~102–116). Replace with `deriveNeutralPeerId(fromHex(keySeed))` imported from
  `@metamask/ocap-kernel`. Drop the `@libp2p/crypto/keys` / `@libp2p/peer-id`
  imports (lines 1–2). The two-kernel assertions (`peerId1 !== peerId2`, ~315)
  stay; they now compare neutral ids.
- **`packages/ocap-kernel/src/remotes/platform/connection-factory.test.ts`.**
  This mocks `@libp2p/crypto/keys` (`generateKeyPairFromSeed`) and imports
  `@libp2p/interface`. It must now also account for `publicKeyFromRaw` /
  `peerIdFromPublicKey` used by the new `#toLibp2pPeerId`. Options, cheapest
  first: (a) extend the `@libp2p/crypto/keys` mock to include a `publicKeyFromRaw`
  that returns a stub with a `.raw`, and mock `@libp2p/peer-id`'s
  `peerIdFromPublicKey` to return a `{ toString() }` stub whose value is a fixed
  libp2p id; (b) for inbound tests, give the mocked `connection.remotePeer` a
  `publicKey.raw` (32 bytes) so `publicKeyToNeutralPeerId` yields a deterministic
  neutral id and assert channels carry the neutral id. Update the existing
  `generateKeyPairFromSeed` call assertion (~392) as needed; it still fires from
  `#generateKeyInfo`. Add at least one test asserting the dial→libp2p-id
  conversion produces the right `/p2p/<libp2pId>` candidate address and that the
  returned channel's `peerId` is neutral.

### 3.7 `docs/identity-backup-recovery.md`

- Scenario 4 (lines ~176–200) currently imports `@libp2p/crypto/keys` +
  `@libp2p/peer-id` to compute a peerId from a mnemonic. Replace with:

  ```ts
  import {
    mnemonicToSeed,
    isValidMnemonic,
    deriveNeutralPeerId,
  } from '@metamask/ocap-kernel';
  import { fromHex } from '@metamask/kernel-utils';

  async function getPeerIdFromMnemonic(mnemonic: string): Promise<string> {
    if (!isValidMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic');
    }
    const seed = await mnemonicToSeed(mnemonic);
    return deriveNeutralPeerId(fromHex(seed));
  }
  ```

  (Also fix the pre-existing doc bug: `mnemonicToSeed` is `async` and must be
  `await`ed.)

- Update the example peer id literals from `12D3KooW…` to a neutral `z…` form and
  the relay-hint example ids as appropriate. Add a one-line "Format change (vX)"
  note that peerIds are now multibase base58btc of the raw Ed25519 public key and
  that identities/URLs from before this change are not compatible.

---

## 4. Dependency changes

### Add

- `@metamask/ocap-kernel` → `@noble/curves` (`^1.9.7`; already resolved in the
  workspace at `node_modules/@noble/curves`, and used transitively via
  `@scure/bip39`/`@noble/hashes`). `@noble/curves` declares `@noble/hashes` as its
  dependency (needed for the SHA-512 inside Ed25519), so no separate
  `@noble/hashes` entry is required. Prefer `@noble/curves` over
  `@noble/ed25519` — curves is already present, and `@noble/ciphers` (used by
  `evm-wallet-experiment`) is from the same family if a non-WebCrypto AES-GCM is
  ever wanted; we use WebCrypto here so no cipher dep is added.

### Remove

- `@metamask/kernel-errors` → remove `@libp2p/interface` (last usage; see §3.5).

### Keep (do NOT remove until Phase 4)

`ocap-kernel/package.json` retains **all** its `@libp2p/*`, `@chainsafe/*`,
`libp2p`, `@multiformats/multiaddr`, and `multiformats` deps this phase, because:

- `remotes/platform/connection-factory.ts` still calls `createLibp2p`, all
  transports (`@libp2p/webrtc`, `@libp2p/websockets`, `@libp2p/webtransport`,
  `@libp2p/circuit-relay-v2`, `@chainsafe/libp2p-noise`, `@chainsafe/libp2p-yamux`,
  `@libp2p/bootstrap`, `@libp2p/identify`, `@libp2p/ping`, `@libp2p/utils`),
  `@libp2p/crypto/keys` (`generateKeyPairFromSeed` for the node, **and now**
  `publicKeyFromRaw` for the id conversion), and `@libp2p/peer-id`
  (**now** `peerIdFromPublicKey`).
- `@multiformats/multiaddr` is still used by `utils/multiaddr.ts` and
  `connection-factory.ts`.
- `multiformats` (`multiformats/bases/base58`) is still used by both
  `remote-comms.ts` and the new `identity.ts`, and stays even past Phase 4
  (base58btc is the neutral encoding).

Net for `ocap-kernel`: `remote-comms.ts` stops importing `@libp2p/crypto` and
`@libp2p/peer-id`, but `connection-factory.ts` still imports both, so **no
`@libp2p` dep is removable from `ocap-kernel` in Phase 2.** The wholesale removal
happens in Phase 4 when `connection-factory.ts` leaves for
`@metamask/netlayer-libp2p`.

No `tsconfig.json` / `tsconfig.build.json` `references` changes: `@noble/curves`
is an external dep, and no new internal workspace dependency is introduced.

---

## 5. `ocap:` URL format — before / after

Format string is unchanged: `ocap:{oid}@{host}[,{hint}]*`. Only byte-level
encodings of `oid` and `host` change.

| Field   | Before (libp2p)                                                                  | After (neutral)                                                         |
| ------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `oid`   | `base58btc.encode(salt16 ‖ nonce12 ‖ ct ‖ tag16)` (AES-128-GCM, PBKDF2 from key) | `base58btc.encode(iv12 ‖ ct ‖ tag16)` (AES-256-GCM, key used directly)  |
| `host`  | libp2p PeerId, e.g. `12D3KooWABC…` (no multibase prefix)                         | neutral id, e.g. `z6MkABC…` (base58btc multibase of raw Ed25519 pubkey) |
| `hints` | libp2p relay multiaddrs, e.g. `/ip4/1.2.3.4/tcp/9001/wss/p2p/12D3KooRELAY…`      | **unchanged** (opaque, still libp2p multiaddrs this phase)              |

Before:

```
ocap:z3v8mF…encryptedOid@12D3KooWQr…,/ip4/1.2.3.4/tcp/9001/wss/p2p/12D3KooRELAY…
```

After:

```
ocap:z2Xc9…encryptedOid@z6MkuT…,/ip4/1.2.3.4/tcp/9001/wss/p2p/12D3KooRELAY…
```

(Both `oid` values start with `z` because base58btc multibase is unchanged; the
`host` gains the `z` multibase prefix and shortens, being a raw 32-byte key rather
than a multihash.)

---

## 6. Test plan

1. **Identity derivation vector (deterministic).** In `identity.test.ts` (new,
   co-located): assert `deriveNeutralPeerId(fromHex('00'.repeat(32)))` equals a
   pinned constant. The all-zero-seed Ed25519 public key is
   `3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29`, so the
   expected value is `base58btc.encode(fromHex('3b6a…da29'))` — compute the exact
   `z…` string during implementation and pin it. Add a second nonzero vector.
   Assert `neutralPeerIdToPublicKey(deriveNeutralPeerId(seed))` round-trips to the
   raw pubkey, and that a wrong-length input throws.
2. **Stable peerId from keySeed.** Assert two `initRemoteIdentity` calls with the
   same `keySeed` produce the same neutral peerId, and different seeds differ.
3. **ocap-URL round-trip.** `issueOcapURL(kref)` then `redeemLocalOcapURL` returns
   the original kref, for krefs shorter and longer than `KREF_MIN_LEN`. Assert the
   host segment equals `getPeerId()` and starts with `z`.
4. **oid tamper rejection.** Corrupt the oid (as the existing ~962 test does) and
   assert `ocapURL has bad object reference`; corrupt the IV region and the
   ciphertext region separately.
5. **Wrong-host rejection.** `redeemLocalOcapURL` of a URL whose host is a
   different neutral id throws `ocapURL from a host that's not me` (existing test,
   update the literal host to a `z…` form).
6. **Mnemonic recovery determinism.** Same mnemonic → same neutral peerId across
   two fresh `initRemoteIdentity` runs (fresh store each). Confirms the
   noble-derived id is stable over the BIP39 → seed → pubkey path.
7. **`isRetryableNetworkError`.** `ChannelResetError` ⇒ retryable; Node codes and
   `Dial`/`Transport`/`NO_RESERVATION` still retryable; unknown ⇒ not.
8. **libp2p-boundary conversion (unit, connection-factory.test.ts).** A neutral id
   converts to the expected `/p2p/<libp2pId>` candidate address; an inbound
   connection whose `remotePeer.publicKey.raw` is a known key yields a channel
   with the matching neutral `peerId`; disconnect events forward neutral ids.
9. **Two-kernel integration (`kernel-test/src/remote-comms.test.ts`).** With the
   fake platform-services now deriving neutral ids, two kernels exchange an
   ocap-URL and deliver a message end-to-end; the redeemed reference resolves.
   Confirms neutral ids flow through issue → parse → `remoteFor(host, hints)` →
   send.

Follow repo test conventions: `it('derives …')` verb forms (no "should"),
`it.each` for the vector table, single `toStrictEqual` for whole-object checks,
`makeFoo` helpers over shared mutable state.

---

## 7. Step-by-step execution order

1. Add `@noble/curves` to `ocap-kernel/package.json`; `yarn install`.
2. Create `remotes/kernel/identity.ts` + `identity.test.ts` (§2, §6.1). Export
   `deriveNeutralPeerId` (and `neutralPeerIdToPublicKey`) from the package barrel.
   Land the derivation vector test green in isolation.
3. Swap identity derivation in `remote-comms.ts` `generateKeyInfo` (§3.1).
4. Swap AES-GCM to WebCrypto in `remote-comms.ts` (§3.2).
5. Update `remote-comms.test.ts` (§3.6) and add round-trip/tamper/recovery tests
   (§6.2–6.6). Run `yarn workspace @metamask/ocap-kernel test:dev:quiet`.
6. Add the libp2p-boundary conversions in `connection-factory.ts` (§3.3) and
   update `connection-factory.test.ts` (§3.6, §6.8).
7. `kernel-errors`: edit `isRetryableNetworkError.ts` + test, drop
   `@libp2p/interface` from its `package.json` (§3.5); `yarn install`.
8. Update `kernel-test/src/remote-comms.test.ts` (§3.6, §6.9).
9. Update `docs/identity-backup-recovery.md` (§3.7).
10. `yarn lint:fix`, `yarn build`, `yarn test:dev:quiet` at root; then the e2e
    checks in §8.

Land as one PR (per master plan: one PR per phase, CI green after each).

---

## 8. Verification commands and e2e checks

```bash
# From repo root — turbo-cached lint/build/unit across the monorepo.
yarn lint:fix
yarn build
yarn test:dev:quiet

# Focused unit runs while iterating.
yarn workspace @metamask/ocap-kernel test:dev:quiet
yarn workspace @metamask/kernel-errors test:dev:quiet

# Two-kernel remote-comms integration (neutral ids end-to-end).
# Note: the test package is @ocap/kernel-test and (as of writing) has no separate
# test:integration script — its integration tests run under the normal test runner.
yarn workspace @ocap/kernel-test test:dev:quiet

# Constraints (ensures package.json dep edits are consistent).
yarn constraints
```

Fresh-storage requirement: because the persisted `peerId` format and the
`ocapURLKey` cipher format both change, any test or manual run reusing an
old kernel database will fail identity load or URL redemption. Run integration
and any manual two-kernel-over-relay checks against **fresh** storage (new DB /
`resetStorage: true`). A pre-existing DB is expected to be incompatible — that is
the accepted breaking change, not a bug.

If a relay-backed manual smoke test is run this phase (optional; the full relay
path is exercised in Phase 4 verification), start `ocap relay start`, bring up two
fresh kernels, issue an ocap-URL on one, redeem on the other, and confirm message
delivery. The relay hints in the URL are still libp2p multiaddrs, so the existing
relay works unchanged.

---

## 9. Risks

- **Crypto review flag.** The WebCrypto AES-GCM swap is security-sensitive.
  Preserve the "amateur cryptography" warning and call this out for review.
  Concrete correctness points to verify: 12-byte IV is fresh-random per
  encryption (never reused with the same key); the 256-bit key is imported
  non-extractable; auth-tag failure is caught and surfaced as
  `ocapURL has bad object reference` (no oracle detail leaked). We are _reducing_
  surface (dropping PBKDF2/salt on an already-random key), not adding primitives.
- **Cross-version incompatibility is accepted.** Old peerIds and old `ocap:` URLs
  stop working. No migration by design (user decision #3). The only "risk" is
  operational: anyone testing against a persisted DB must reset it.
- **Multiaddr peerId parsing (subtle).** `getLastPeerId`/`candidateAddressStrings`
  operate on **libp2p** ids embedded in multiaddrs. The conversion must happen
  _before_ `candidateAddressStrings` (dial entry point) and the returned channel
  and disconnect events must be re-mapped to neutral. Getting the boundary wrong
  in either direction (e.g. building `/p2p/<neutralId>` or emitting a libp2p id to
  the transport) breaks dialing or peer-state bookkeeping silently. §3.3 pins the
  exact points; §6.8 tests them.
- **Ed25519 derivation parity.** The plan assumes noble's
  `ed25519.getPublicKey(seed)` yields the same raw pubkey libp2p derived from the
  same seed. This is true (both are noble-based, deterministic), but since the
  persisted format changes anyway there is no old-vs-new comparison to satisfy —
  the only requirement is internal self-consistency (derive → dial-convert →
  inbound-convert all agree), covered by §6.8/§6.9.
- **`connection.remotePeer.publicKey` absence.** For our Ed25519, noise-secured
  peers `.publicKey` is present. Guard the inbound path: if absent, log and drop
  rather than fabricate a neutral id.
- **connection-factory test churn.** The added libp2p-key mocks
  (`publicKeyFromRaw`, `peerIdFromPublicKey`) are the fiddliest part; budget for
  it. Prefer a small deterministic stub over reconstructing real libp2p keys in
  tests.

---

## 10. Estimate

~2–3 dev-days, consistent with the master plan. Rough split: identity helper +
crypto swap + their tests (~1 day); connection-factory boundary conversion +
its test churn (~0.5–1 day, the fiddliest piece); kernel-errors + kernel-test +
docs + full verification/e2e (~0.5–1 day).
