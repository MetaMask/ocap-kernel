import { remoteDeliverSpec, remoteDeliverHandler } from './remoteDeliver.ts';
import type {
  RemoteDeliverSpec,
  RemoteDeliverHandler,
} from './remoteDeliver.ts';
import { remoteGiveUpSpec, remoteGiveUpHandler } from './remoteGiveUp.ts';
import type { RemoteGiveUpSpec, RemoteGiveUpHandler } from './remoteGiveUp.ts';
import {
  remoteIncarnationChangeSpec,
  remoteIncarnationChangeHandler,
} from './remoteIncarnationChange.ts';
import type {
  RemoteIncarnationChangeSpec,
  RemoteIncarnationChangeHandler,
} from './remoteIncarnationChange.ts';

export const kernelRemoteHandlers = {
  remoteDeliver: remoteDeliverHandler,
  remoteGiveUp: remoteGiveUpHandler,
  remoteIncarnationChange: remoteIncarnationChangeHandler,
} as {
  remoteDeliver: RemoteDeliverHandler;
  remoteGiveUp: RemoteGiveUpHandler;
  remoteIncarnationChange: RemoteIncarnationChangeHandler;
};

export const kernelRemoteMethodSpecs = {
  remoteDeliver: remoteDeliverSpec,
  remoteGiveUp: remoteGiveUpSpec,
  remoteIncarnationChange: remoteIncarnationChangeSpec,
} as {
  remoteDeliver: RemoteDeliverSpec;
  remoteGiveUp: RemoteGiveUpSpec;
  remoteIncarnationChange: RemoteIncarnationChangeSpec;
};

type Handlers =
  (typeof kernelRemoteHandlers)[keyof typeof kernelRemoteHandlers];

export type KernelRemoteMethod = Handlers['method'];
