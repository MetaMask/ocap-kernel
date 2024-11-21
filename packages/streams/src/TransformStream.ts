import { BaseDuplexStream } from './BaseDuplexStream.js';
import { BaseReader, BaseWriter } from './BaseStream.js';
import type { BaseReaderArgs, Reader } from './BaseStream.js';

type TransformFn<Read, Write> = (value: Write) => Read | Promise<Read>;

class TransformReader<Write> extends BaseReader<Write> {
  constructor(args: BaseReaderArgs<Write>) {
    super(args);
    harden(this);
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  static make<Read, Write>(
    args: BaseReaderArgs<Write> & { transform: TransformFn<Read, Write> },
  ) {
    const reader = new TransformReader<Write>(args);
    const mappedReader: Reader<unknown> = harden({
      [Symbol.asyncIterator]: () => mappedReader,
      next: async (): Promise<IteratorResult<Read, undefined>> => {
        const result = await reader.next();
        return result.done
          ? result
          : {
              value: await args.transform(result.value),
              done: false,
            };
      },
      return: reader.return.bind(reader),
      throw: reader.throw.bind(reader),
      end: reader.end.bind(reader),
    });
    return [mappedReader as Reader<Read>, reader.getReceiveInput()] as const;
  }
}
harden(TransformReader);

// TODO: ESLint erroneously believes we have Node globals here.
// eslint-disable-next-line @typescript-eslint/no-shadow
export class TransformStream<Read, Write> extends BaseDuplexStream<
  Read,
  Write
> {
  constructor(transform: TransformFn<Read, Write>) {
    let writer: BaseWriter<Write>; // eslint-disable-line prefer-const
    const [reader, receiveInput] = TransformReader.make<Read, Write>({
      transform,
      onEnd: async () => {
        await writer.return();
      },
    });

    writer = new BaseWriter<Write>({
      onDispatch: async (value) => await receiveInput(value),
      onEnd: async () => {
        await reader.return();
      },
    });
    super(reader, writer);
    harden(this);
  }
}
harden(TransformStream);
