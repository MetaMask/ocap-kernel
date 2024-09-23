import type { Reader as EndoReader, Writer as EndoWriter } from '@endo/stream';
import { isObject } from '@metamask/utils';

export abstract class Reader<Yield> implements EndoReader<Yield> {
  abstract next(): Promise<IteratorResult<Yield>>;

  abstract return(): Promise<IteratorResult<Yield>>;

  abstract throw(error: Error): Promise<IteratorResult<Yield>>;

  abstract [Symbol.asyncIterator](): Reader<Yield>;
}

export abstract class Writer<Yield> implements EndoWriter<Yield> {
  abstract next(value: Yield): Promise<IteratorResult<undefined>>;

  abstract return(): Promise<IteratorResult<undefined>>;

  abstract throw(error: Error): Promise<IteratorResult<undefined>>;

  abstract [Symbol.asyncIterator](): Writer<Yield>;
}

export type ReaderMessage<Yield> = {
  data: IteratorResult<Yield, undefined>;
};

export type WriterMessage<Yield> = IteratorResult<Yield, undefined> | Error;

export const isStream = (
  value: unknown,
): value is Reader<unknown> | Writer<unknown> =>
  isObject(value) &&
  typeof value.next === 'function' &&
  typeof value.return === 'function' &&
  typeof value.throw === 'function';
