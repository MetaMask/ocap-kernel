export {
  initializeMessageChannel,
  receiveMessagePort,
} from './message-channel.js';
export type { StreamPair } from './stream-pair.js';
export type { Connection } from './connection.js';
export type { Reader, Writer, ReaderMessage, WriterMessage } from './shared.js';
export { makeConnectionStreamPair } from './stream-pair.js';
export {
  makeMessagePortStreamPair,
  makeMessagePortReader,
  makeMessagePortWriter,
} from './message-port.js';
export {
  makeStreamEnvelopeKit,
  type StreamEnvelopeKit,
  type MakeStreamEnvelopeHandler,
} from './envelope-kit.js';
export type { StreamEnvelopeHandler } from './envelope-handler.js';
export type { StreamEnveloper } from './enveloper.js';
export type { Envelope, StreamEnvelope } from './envelope.js';
