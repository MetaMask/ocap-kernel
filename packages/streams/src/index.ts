export {
  initializeMessageChannel,
  receiveMessagePort,
} from './message-channel.js';
export type { Reader, Writer } from './utils.js';
export type { DuplexStream } from './BaseDuplexStream.js';
export {
  MessagePortDuplexStream,
  MessagePortMultiplexer,
  MessagePortReader,
  MessagePortWriter,
} from './MessagePortStream.js';
export type { ChromeRuntime, ChromeMessageSender } from './chrome.d.ts';
export {
  ChromeRuntimeDuplexStream,
  ChromeRuntimeMultiplexer,
  ChromeRuntimeStreamTarget as ChromeRuntimeTarget,
  ChromeRuntimeReader,
  ChromeRuntimeWriter,
} from './ChromeRuntimeStream.js';
export {
  PostMessageDuplexStream,
  PostMessageMultiplexer,
  PostMessageReader,
  PostMessageWriter,
} from './PostMessageStream.js';
export { StreamMultiplexer, isMultiplexEnvelope } from './StreamMultiplexer.js';
export type {
  HandledDuplexStream,
  MultiplexEnvelope,
} from './StreamMultiplexer.js';
