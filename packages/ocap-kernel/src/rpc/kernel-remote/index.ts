import { remoteDeliverSpec, remoteDeliverHandler } from './remoteDeliver.ts';
import type {
  RemoteDeliverSpec,
  RemoteDeliverHandler,
} from './remoteDeliver.ts';
import { remoteGiveUpSpec, remoteGiveUpHandler } from './remoteGiveUp.ts';
import type { RemoteGiveUpSpec, RemoteGiveUpHandler } from './remoteGiveUp.ts';

export const kernelRemoteHandlers = {
  remoteDeliver: remoteDeliverHandler,
  remoteGiveUp: remoteGiveUpHandler,
} as {
  remoteDeliver: RemoteDeliverHandler;
  remoteGiveUp: RemoteGiveUpHandler;
};

export const kernelRemoteMethodSpecs = {
  remoteDeliver: remoteDeliverSpec,
  remoteGiveUp: remoteGiveUpSpec,
} as {
  remoteDeliver: RemoteDeliverSpec;
  remoteGiveUp: RemoteGiveUpSpec;
};

type Handlers =
  (typeof kernelRemoteHandlers)[keyof typeof kernelRemoteHandlers];

export type KernelRemoteMethod = Handlers['method'];
