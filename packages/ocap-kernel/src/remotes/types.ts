import type { ByteStream } from 'it-byte-stream';

export type InboundConnectionHandler = (channel: Channel) => void;

export type Channel = {
  msgStream: ByteStream;
  peerId: string;
  hints: string[];
};

export type RemoteMessageHandler = (
  from: string,
  message: string,
) => Promise<string>;

export type SendRemoteMessage = (
  to: string,
  message: string,
  hints?: string[],
) => Promise<void>;

export type StopRemoteComms = () => Promise<void>;

export type RemoteComms = {
  getPeerId: () => string;
  sendRemoteMessage: SendRemoteMessage;
  issueOcapURL: (kref: string) => Promise<string>;
  redeemLocalOcapURL: (ocapURL: string) => Promise<string>;
  stopRemoteComms: StopRemoteComms;
  closeConnection: (peerId: string) => Promise<void>;
  reconnectPeer: (peerId: string, hints?: string[]) => Promise<void>;
};

export type RemoteInfo = {
  peerId: string;
  hints?: string[];
};
