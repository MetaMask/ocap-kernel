export {
  initializeMessageChannel,
  receiveMessagePort,
} from './message-channel.js';
export type { Reader, Writer } from './BaseStream.js';
export type { DuplexStream } from './BaseDuplexStream.js';
export {
  MessagePortDuplexStream,
  MessagePortMultiplexer,
  MessagePortReader,
  MessagePortWriter,
} from './browser/MessagePortStream.js';
export type { ChromeRuntime, ChromeMessageSender } from './chrome.d.ts';
export {
  ChromeRuntimeDuplexStream,
  ChromeRuntimeMultiplexer,
  ChromeRuntimeStreamTarget as ChromeRuntimeTarget,
  ChromeRuntimeReader,
  ChromeRuntimeWriter,
} from './browser/ChromeRuntimeStream.js';
export {
  PostMessageDuplexStream,
  PostMessageMultiplexer,
  PostMessageReader,
  PostMessageWriter,
} from './browser/PostMessageStream.js';
export { StreamMultiplexer, isMultiplexEnvelope } from './StreamMultiplexer.js';
export type { MultiplexEnvelope } from './StreamMultiplexer.js';
export { TransformStream } from './TransformStream.js';
