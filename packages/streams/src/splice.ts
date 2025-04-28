import { stringify } from '@ocap/utils';

import type { DuplexStream } from './BaseDuplexStream.ts';
import { BaseReader } from './BaseStream.ts';
import type { BaseReaderArgs, ReceiveInput } from './BaseStream.ts';

class SplicedReader<Read> extends BaseReader<Read> {
  // eslint-disable-next-line no-restricted-syntax
  private constructor(args: BaseReaderArgs<Read>) {
    super(args);
  }

  static make<Read>(
    args: BaseReaderArgs<Read>,
  ): [SplicedReader<Read>, ReceiveInput] {
    const reader = new SplicedReader<Read>(args);
    return [reader, reader.getReceiveInput()] as const;
  }
}

/**
 * A {@link DuplexStream} for use within {@link splice} that reads from a reader and forwards
 * writes to a parent. The reader should output a subset of the parent stream's values based
 * on some predicate.
 */
class SplicedStream<ParentRead, Read extends ParentRead, Write>
  implements DuplexStream<Read, Write>
{
  readonly #parent: DuplexStream<ParentRead, Write>;

  readonly #reader: SplicedReader<Read>;

  constructor(
    parent: DuplexStream<ParentRead, Write>,
    reader: SplicedReader<Read>,
  ) {
    this.#parent = parent;
    this.#reader = reader;
  }

  static make<ParentRead, Read extends ParentRead, Write>(
    parent: DuplexStream<ParentRead, Write>,
  ): {
    stream: SplicedStream<ParentRead, Read, Write>;
    receiveInput: ReceiveInput;
  } {
    const [reader, receiveInput] = SplicedReader.make<Read>({
      name: this.constructor.name,
    });
    const stream = new SplicedStream(parent, reader);
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

export function splice<
  Read,
  Write,
  ReadA extends Read,
  WriteA extends Write,
  ReadB extends Read,
  WriteB extends Write,
>(
  stream: DuplexStream<Read, Write>,
  predicateA: (value: Read) => value is ReadA,
  predicateB: (value: Read) => value is ReadB,
): [DuplexStream<ReadA, WriteA>, DuplexStream<ReadB, WriteB>];

export function splice<
  Read,
  Write,
  ReadA extends Read,
  WriteA extends Write,
  ReadB extends Read,
  WriteB extends Write,
  ReadC extends Read,
  WriteC extends Write,
>(
  stream: DuplexStream<Read, Write>,
  predicateA: (value: Read) => value is ReadA,
  predicateB: (value: Read) => value is ReadB,
  predicateC: (value: Read) => value is ReadC,
): [
  DuplexStream<ReadA, WriteA>,
  DuplexStream<ReadB, WriteB>,
  DuplexStream<ReadC, WriteC>,
];

export function splice<
  Read,
  Write,
  ReadA extends Read,
  WriteA extends Write,
  ReadB extends Read,
  WriteB extends Write,
  ReadC extends Read,
  WriteC extends Write,
  ReadD extends Read,
  WriteD extends Write,
>(
  stream: DuplexStream<Read, Write>,
  predicateA: (value: Read) => value is ReadA,
  predicateB: (value: Read) => value is ReadB,
  predicateC: (value: Read) => value is ReadC,
  predicateD: (value: Read) => value is ReadD,
): [
  DuplexStream<ReadA, WriteA>,
  DuplexStream<ReadB, WriteB>,
  DuplexStream<ReadC, WriteC>,
  DuplexStream<ReadD, WriteD>,
];

/**
 * Splices a stream into multiple streams based on a list of predicates.
 * Supports up to 4 predicates with type checking, and any number without!
 *
 * @param parentStream - The stream to splice.
 * @param predicates - The predicates to use to split the stream.
 * @returns An array of splices.
 */
export function splice<Read, Write>(
  parentStream: DuplexStream<Read, Write>,
  ...predicates: ((value: unknown) => boolean)[]
): DuplexStream<Read, Write>[] {
  const splices = predicates.map(
    (predicate) => [predicate, SplicedStream.make(parentStream)] as const,
  );

  // eslint-disable-next-line no-void
  void (async () => {
    let error: Error | undefined;
    try {
      for await (const value of parentStream) {
        let matched = false;
        for (const [predicate, { receiveInput }] of splices) {
          if ((matched = predicate(value))) {
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

    for (const [, { stream }] of splices) {
      await stream.end(error);
    }
  })();

  return splices.map(([, { stream }]) => stream);
}
