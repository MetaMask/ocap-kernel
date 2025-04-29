import { stringify } from '@ocap/utils';

import type { DuplexStream } from './BaseDuplexStream.ts';
import { BaseReader } from './BaseStream.ts';
import type { BaseReaderArgs, ReceiveInput } from './BaseStream.ts';

class SplitReader<Read> extends BaseReader<Read> {
  // eslint-disable-next-line no-restricted-syntax
  private constructor(args: BaseReaderArgs<Read>) {
    super(args);
  }

  static make<Read>(
    args: BaseReaderArgs<Read>,
  ): [SplitReader<Read>, ReceiveInput] {
    const reader = new SplitReader<Read>(args);
    return [reader, reader.getReceiveInput()] as const;
  }
}
harden(SplitReader);

/**
 * A {@link DuplexStream} for use within {@link split} that reads from a reader and forwards
 * writes to a parent. The reader should output a subset of the parent stream's values based
 * on some predicate.
 */
class SplitStream<ParentRead, Read extends ParentRead, Write>
  implements DuplexStream<Read, Write>
{
  readonly #parent: DuplexStream<ParentRead, Write>;

  readonly #reader: SplitReader<Read>;

  constructor(
    parent: DuplexStream<ParentRead, Write>,
    reader: SplitReader<Read>,
  ) {
    this.#parent = parent;
    this.#reader = reader;
    harden(this);
  }

  static make<ParentRead, Read extends ParentRead, Write>(
    parent: DuplexStream<ParentRead, Write>,
  ): {
    stream: SplitStream<ParentRead, Read, Write>;
    receiveInput: ReceiveInput;
  } {
    const [reader, receiveInput] = SplitReader.make<Read>({
      name: this.constructor.name,
    });
    const stream = new SplitStream(parent, reader);
    return { stream, receiveInput };
  }

  async next(): Promise<IteratorResult<Read, undefined>> {
    return this.#reader.next();
  }

  async write(value: Write): Promise<IteratorResult<undefined, undefined>> {
    return this.#parent.write(value);
  }

  async drain(handler: (value: Read) => void | Promise<void>): Promise<void> {
    for await (const value of this.#reader) {
      await handler(value);
    }
  }

  async pipe<Read2>(sink: DuplexStream<Read2, Read>): Promise<void> {
    await this.drain(async (value) => {
      await sink.write(value);
    });
  }

  async return(): Promise<IteratorResult<Read, undefined>> {
    await this.#parent.return();
    return this.#reader.return();
  }

  async throw(error: Error): Promise<IteratorResult<Read, undefined>> {
    await this.#parent.throw(error);
    return this.#reader.throw(error);
  }

  async end(error?: Error): Promise<IteratorResult<Read, undefined>> {
    await this.#parent.end(error);
    return this.#reader.end(error);
  }

  [Symbol.asyncIterator](): typeof this {
    return this;
  }
}
harden(SplitStream);

// There's no reason to do this but we leave it in for the sake of completeness.
export function split<Read, Write, ReadA extends Read>(
  stream: DuplexStream<Read, Write>,
  predicateA: (value: Read) => value is ReadA,
): [DuplexStream<ReadA, Write>];

export function split<Read, Write, ReadA extends Read, ReadB extends Read>(
  stream: DuplexStream<Read, Write>,
  predicateA: (value: Read) => value is ReadA,
  predicateB: (value: Read) => value is ReadB,
): [DuplexStream<ReadA, Write>, DuplexStream<ReadB, Write>];

export function split<
  Read,
  Write,
  ReadA extends Read,
  ReadB extends Read,
  ReadC extends Read,
>(
  stream: DuplexStream<Read, Write>,
  predicateA: (value: Read) => value is ReadA,
  predicateB: (value: Read) => value is ReadB,
  predicateC: (value: Read) => value is ReadC,
): [
  DuplexStream<ReadA, Write>,
  DuplexStream<ReadB, Write>,
  DuplexStream<ReadC, Write>,
];

export function split<
  Read,
  Write,
  ReadA extends Read,
  ReadB extends Read,
  ReadC extends Read,
  ReadD extends Read,
>(
  stream: DuplexStream<Read, Write>,
  predicateA: (value: Read) => value is ReadA,
  predicateB: (value: Read) => value is ReadB,
  predicateC: (value: Read) => value is ReadC,
  predicateD: (value: Read) => value is ReadD,
): [
  DuplexStream<ReadA, Write>,
  DuplexStream<ReadB, Write>,
  DuplexStream<ReadC, Write>,
  DuplexStream<ReadD, Write>,
];

/**
 * Splits a stream into multiple streams based on a list of predicates.
 * Supports up to 4 predicates with type checking, and any number without!
 *
 * @param parentStream - The stream to split.
 * @param predicates - The predicates to use to split the stream.
 * @returns An array of "splits" of the parent stream.
 */
export function split<Read, Write>(
  parentStream: DuplexStream<Read, Write>,
  ...predicates: ((value: Read) => boolean)[]
): DuplexStream<Read, Write>[] {
  const splits = predicates.map(
    (predicate) => [predicate, SplitStream.make(parentStream)] as const,
  );

  // eslint-disable-next-line no-void
  void (async () => {
    let error: Error | undefined;
    try {
      for await (const value of parentStream) {
        let matched = false;
        for (const [predicate, { receiveInput }] of splits) {
          if (predicate(value)) {
            matched = true;
            await receiveInput(value);
            break;
          }
        }

        if (!matched) {
          throw new Error(
            `Failed to match any predicate for value: ${stringify(value)}`,
          );
        }
      }
    } catch (caughtError) {
      error = caughtError as Error;
    }

    await Promise.all(splits.map(async ([, { stream }]) => stream.end(error)));
  })();

  return splits.map(([, { stream }]) => stream);
}
