export { NodejsPlatformServices } from './kernel/PlatformServices.ts';
export { makeKernel } from './kernel/make-kernel.ts';
export { makeNodeJsVatSupervisor } from './vat/make-supervisor.ts';

// TODO: Re-export presence manager when moved from kernel-browser-runtime
// // Re-export presence manager from kernel-browser-runtime for E() support
// export { makePresenceManager } from '@metamask/kernel-browser-runtime';
// export type {
//   PresenceManager,
//   PresenceManagerOptions,
// } from '@metamask/kernel-browser-runtime';
