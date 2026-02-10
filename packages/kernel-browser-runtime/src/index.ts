export { rpcHandlers, rpcMethodSpecs } from '@metamask/ocap-kernel/rpc';
export type { KernelControlMethod } from '@metamask/ocap-kernel/rpc';
export {
  connectToKernel,
  receiveInternalConnections,
} from './internal-comms/index.ts';
export type {
  KernelRpcReplyStream,
  KernelRpcStream,
} from './internal-comms/index.ts';
export * from './makeIframeVatWorker.ts';
export * from './PlatformServicesClient.ts';
export * from './PlatformServicesServer.ts';
export * from './utils/index.ts';
export {
  makeBackgroundCapTP,
  isCapTPNotification,
  getCapTPMessage,
  makeCapTPNotification,
  type BackgroundCapTP,
  type BackgroundCapTPOptions,
  type CapTPMessage,
} from './background-captp.ts';
