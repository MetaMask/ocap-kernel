export { NodejsPlatformServices } from './kernel/PlatformServices.ts';
export { makeKernel } from './kernel/make-kernel.ts';
export { makeNodeJsVatSupervisor } from './vat/make-supervisor.ts';

// Re-export presence manager from ocap-kernel for E() support
export { makePresenceManager } from '@metamask/ocap-kernel';
export type {
  PresenceManager,
  PresenceManagerOptions,
} from '@metamask/ocap-kernel';
