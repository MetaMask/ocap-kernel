/* global hardenIntrinsics */

// Node.js-specific endoify that imports modules which modify globals before lockdown.
// This file is NOT bundled - it must be imported directly from src/.

// eslint-disable-next-line import-x/no-unresolved -- self-import resolved at runtime
import '@metamask/kernel-shims/endoify-repair';

// @libp2p/webrtc needs to modify globals in Node.js only, so we need to import
// it before hardening.
// eslint-disable-next-line import-x/no-unresolved -- peer dependency
import '@libp2p/webrtc';

hardenIntrinsics();
