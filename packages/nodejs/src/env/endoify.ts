import '@metamask/kernel-shims/endoify-repair';

// @libp2p/webrtc needs to modify globals in Node.js only, so we need to import
// it before hardening.
import '@libp2p/webrtc';

hardenIntrinsics();
