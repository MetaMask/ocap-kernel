import { remoteDeliverSpec, remoteDeliverHandler } from './remoteDeliver.ts';
import type {
  RemoteDeliverSpec,
  RemoteDeliverHandler,
} from './remoteDeliver.ts';

export const kernelRemoteHandlers = {
  remoteDeliver: remoteDeliverHandler,
} as {
  remoteDeliver: RemoteDeliverHandler;
};

export const kernelRemoteMethodSpecs = {
  remoteDeliver: remoteDeliverSpec,
} as {
  remoteDeliver: RemoteDeliverSpec;
};

type Handlers =
  (typeof kernelRemoteHandlers)[keyof typeof kernelRemoteHandlers];

export type KernelRemoteMethod = Handlers['method'];
