export * from './rpc-handlers/index.ts';
export {
  establishKernelConnection,
  receiveUiConnections,
} from './ui-connections.ts';
export type {
  KernelControlReplyStream,
  KernelControlStream,
} from './ui-connections.ts';
export * from './makeIframeVatWorker.ts';
export * from './PlatformServicesClient.ts';
export * from './PlatformServicesServer.ts';

// XXX this is the wrong place for this
export type { RemoteComms } from './network.ts';
export { initRemoteComms } from './network.ts';
