import {
  closeConnectionSpec,
  closeConnectionHandler,
} from './closeConnection.ts';
import type {
  CloseConnectionSpec,
  CloseConnectionHandler,
} from './closeConnection.ts';
import {
  initializeRemoteCommsSpec,
  initializeRemoteCommsHandler,
} from './initializeRemoteComms.ts';
import type {
  InitializeRemoteCommsSpec,
  InitializeRemoteCommsHandler,
} from './initializeRemoteComms.ts';
import { launchSpec, launchHandler } from './launch.ts';
import type { LaunchSpec, LaunchHandler } from './launch.ts';
import { reconnectPeerSpec, reconnectPeerHandler } from './reconnectPeer.ts';
import type {
  ReconnectPeerSpec,
  ReconnectPeerHandler,
} from './reconnectPeer.ts';
import {
  registerLocationHintsSpec,
  registerLocationHintsHandler,
} from './registerLocationHints.ts';
import type {
  RegisterLocationHintsSpec,
  RegisterLocationHintsHandler,
} from './registerLocationHints.ts';
import {
  sendRemoteMessageSpec,
  sendRemoteMessageHandler,
} from './sendRemoteMessage.ts';
import type {
  SendRemoteMessageSpec,
  SendRemoteMessageHandler,
} from './sendRemoteMessage.ts';
import {
  stopRemoteCommsHandler,
  stopRemoteCommsSpec,
} from './stopRemoteComms.ts';
import type {
  StopRemoteCommsHandler,
  StopRemoteCommsSpec,
} from './stopRemoteComms.ts';
import { terminateSpec, terminateHandler } from './terminate.ts';
import type { TerminateSpec, TerminateHandler } from './terminate.ts';
import { terminateAllSpec, terminateAllHandler } from './terminateAll.ts';
import type { TerminateAllSpec, TerminateAllHandler } from './terminateAll.ts';

export const platformServicesHandlers = {
  launch: launchHandler,
  terminate: terminateHandler,
  terminateAll: terminateAllHandler,
  sendRemoteMessage: sendRemoteMessageHandler,
  initializeRemoteComms: initializeRemoteCommsHandler,
  stopRemoteComms: stopRemoteCommsHandler,
  closeConnection: closeConnectionHandler,
  registerLocationHints: registerLocationHintsHandler,
  reconnectPeer: reconnectPeerHandler,
} as {
  launch: LaunchHandler;
  terminate: TerminateHandler;
  terminateAll: TerminateAllHandler;
  sendRemoteMessage: SendRemoteMessageHandler;
  initializeRemoteComms: InitializeRemoteCommsHandler;
  stopRemoteComms: StopRemoteCommsHandler;
  closeConnection: CloseConnectionHandler;
  registerLocationHints: RegisterLocationHintsHandler;
  reconnectPeer: ReconnectPeerHandler;
};

export type PlatformServicesMethodSpecs =
  | typeof launchSpec
  | typeof terminateSpec
  | typeof terminateAllSpec
  | typeof sendRemoteMessageSpec
  | typeof initializeRemoteCommsSpec
  | typeof stopRemoteCommsSpec
  | typeof closeConnectionSpec
  | typeof registerLocationHintsSpec
  | typeof reconnectPeerSpec;

export const platformServicesMethodSpecs = {
  launch: launchSpec,
  terminate: terminateSpec,
  terminateAll: terminateAllSpec,
  sendRemoteMessage: sendRemoteMessageSpec,
  initializeRemoteComms: initializeRemoteCommsSpec,
  stopRemoteComms: stopRemoteCommsSpec,
  closeConnection: closeConnectionSpec,
  registerLocationHints: registerLocationHintsSpec,
  reconnectPeer: reconnectPeerSpec,
} as {
  launch: LaunchSpec;
  terminate: TerminateSpec;
  terminateAll: TerminateAllSpec;
  sendRemoteMessage: SendRemoteMessageSpec;
  initializeRemoteComms: InitializeRemoteCommsSpec;
  stopRemoteComms: StopRemoteCommsSpec;
  closeConnection: CloseConnectionSpec;
  registerLocationHints: RegisterLocationHintsSpec;
  reconnectPeer: ReconnectPeerSpec;
};

export type PlatformServicesMethod = PlatformServicesMethodSpecs['method'];
