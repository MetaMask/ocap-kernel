export type { Reader, Writer } from './utils.ts';
export type { DuplexStream } from './BaseDuplexStream.ts';
export {
  NodeWorkerReader,
  NodeWorkerWriter,
  NodeWorkerDuplexStream,
} from './node/NodeWorkerStream.ts';
export { split } from './split.ts';
export { makeIteratorRef } from './vat/reader-ref.ts';
export { makeRefIterator } from './vat/ref-reader.ts';
