/* global repairIntrinsics */
import 'ses';
import '@endo/eventual-send/shim.js';

const isTest = import.meta?.env?.MODE === 'test';

// Read LOCKDOWN_ERROR_TRAPPING env var if available, otherwise use the default 'platform'.
// Use 'none' to prevent SES from calling process.exit on uncaught
// exceptions, which conflicts with test runners like Vitest that intercept exit.
/** @type {'platform' | 'exit' | 'abort' | 'report' | 'none'} */
// @ts-ignore - We need to use the global process object to read the env var.
const errorTrapping =
  globalThis.process?.env?.LOCKDOWN_ERROR_TRAPPING ?? 'platform';

repairIntrinsics({
  consoleTaming: 'unsafe',
  errorTaming: isTest ? 'unsafe-debug' : 'unsafe',
  errorTrapping,
  overrideTaming: 'severe',
  domainTaming: 'unsafe',
  stackFiltering: isTest ? 'verbose' : 'concise',
});
