/**
 * Suppress known uncaught exceptions from node-datachannel native module.
 *
 * When a WebRTC DataChannel is closed while a send is in flight,
 * node-datachannel v0.29.0 (@libp2p/webrtc v6) throws an asynchronous
 * uncaught exception from the native layer. This is benign — the connection
 * is already being torn down — but Vitest v4 treats uncaught exceptions as
 * test failures.
 *
 * This setup file installs a handler that suppresses only this specific error.
 */
process.on('uncaughtException', (error: Error) => {
  if (
    error.message?.includes('DataChannel is closed') ||
    error.message?.includes('libdatachannel error')
  ) {
    // Benign: native WebRTC module fires async error after channel teardown.
    return;
  }
  // For non-datachannel errors, log and set exit code so Vitest reports
  // the failure. Re-throwing inside uncaughtException would hard-kill the
  // process without Vitest diagnostics.
  console.error('Uncaught exception in e2e test:', error);
  process.exitCode = 1;
});
