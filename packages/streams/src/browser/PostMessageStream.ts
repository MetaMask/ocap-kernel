/**
 * This module provides a pair of classes for creating readable and writable streams
 * over a [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).
 * function.
 *
 * @module PostMessage streams
 */

import type { OnMessage, PostMessage } from './utils.js';
import {
  BaseDuplexStream,
  makeDuplexStreamInputValidator,
} from '../BaseDuplexStream.js';
import type { BaseReaderArgs, BaseWriterArgs } from '../BaseStream.js';
import { BaseReader, BaseWriter } from '../BaseStream.js';
import {
  isMultiplexEnvelope,
  StreamMultiplexer,
} from '../StreamMultiplexer.js';
import type { MultiplexEnvelope } from '../StreamMultiplexer.js';
import { isSignalLike } from '../utils.js';
import type { Dispatchable } from '../utils.js';

type SetListener = (onMessage: OnMessage) => void;
type RemoveListener = (onMessage: OnMessage) => void;

type PostMessageReaderArgs<Read> = BaseReaderArgs<Read> & {
  setListener: SetListener;
  removeListener: RemoveListener;
} & (Read extends MessageEvent
    ? {
        messageEventMode: 'event';
      }
    : {
        messageEventMode?: 'data' | undefined;
      });

/**
 * A readable stream over a {@link PostMessage} function.
 *
 * Ignores message events dispatched on its port that contain ports, but otherwise
 * expects {@link Dispatchable} values to be posted to its port.
 *
 * @see {@link PostMessageWriter} for the corresponding writable stream.
 */
export class PostMessageReader<Read> extends BaseReader<Read> {
  constructor({
    setListener,
    removeListener,
    validateInput,
    onEnd,
    messageEventMode = 'data',
  }: PostMessageReaderArgs<Read>) {
    // eslint-disable-next-line prefer-const
    let onMessage: OnMessage;

    super({
      validateInput,
      onEnd: async (error) => {
        removeListener(onMessage);
        await onEnd?.(error);
      },
    });

    const receiveInput = super.getReceiveInput();
    onMessage = (messageEvent) => {
      const value =
        isSignalLike(messageEvent.data) || messageEventMode === 'data'
          ? messageEvent.data
          : messageEvent;
      receiveInput(value).catch(async (error) => this.throw(error));
    };
    setListener(onMessage);

    harden(this);
  }
}
harden(PostMessageReader);

/**
 * A writable stream over a {@link PostMessage} function.
 *
 * @see {@link PostMessageReader} for the corresponding readable stream.
 */
export class PostMessageWriter<Write> extends BaseWriter<Write> {
  constructor(
    postMessageFn: PostMessage,
    { name, onEnd }: Omit<BaseWriterArgs<Write>, 'onDispatch'> = {},
  ) {
    super({
      name,
      onDispatch: (value: Dispatchable<Write>) => postMessageFn(value),
      onEnd: async (error) => {
        await onEnd?.(error);
      },
    });
    harden(this);
  }
}
harden(PostMessageWriter);

type PostMessageDuplexStreamArgs<Read> = {
  postMessageFn: PostMessage;
} & PostMessageReaderArgs<Read>;

/**
 * A duplex stream over a {@link PostMessage} function.
 *
 * @see {@link PostMessageReader} for the corresponding readable stream.
 * @see {@link PostMessageWriter} for the corresponding writable stream.
 */
export class PostMessageDuplexStream<
  Read,
  Write = Read,
> extends BaseDuplexStream<
  Read,
  PostMessageReader<Read>,
  Write,
  PostMessageWriter<Write>
> {
  constructor({
    postMessageFn,
    validateInput,
    ...args
  }: PostMessageDuplexStreamArgs<Read>) {
    let writer: PostMessageWriter<Write>; // eslint-disable-line prefer-const
    const reader = new PostMessageReader<Read>({
      ...args,
      validateInput: makeDuplexStreamInputValidator(validateInput),
      onEnd: async () => {
        await writer.return();
      },
    } as PostMessageReaderArgs<Read>);
    writer = new PostMessageWriter<Write>(postMessageFn, {
      name: 'PostMessageDuplexStream',
      onEnd: async () => {
        await reader.return();
      },
    });
    super(reader, writer);
  }

  static async make<Read, Write = Read>(
    args: PostMessageDuplexStreamArgs<Read>,
  ): Promise<PostMessageDuplexStream<Read, Write>> {
    const stream = new PostMessageDuplexStream<Read, Write>(args);
    await stream.synchronize();
    return stream;
  }
}
harden(PostMessageDuplexStream);

type PostMessageMultiplexerArgs = Omit<
  PostMessageDuplexStreamArgs<MultiplexEnvelope>,
  'validateInput' | 'messageEventMode'
> & {
  name?: string;
};

/**
 * A multiplexer over a {@link PostMessage} function. The multiplexer cannot
 * be used with `messageEventMode: 'event'` because it needs to operate on
 * multiplex envelopes directly.
 *
 * @see {@link PostMessageDuplexStream} for the corresponding duplex stream.
 */
export class PostMessageMultiplexer extends StreamMultiplexer {
  constructor({ name, ...args }: PostMessageMultiplexerArgs) {
    super(
      new PostMessageDuplexStream({
        ...args,
        messageEventMode: 'data',
        validateInput: isMultiplexEnvelope,
      }),
      name,
    );
    harden(this);
  }
}
harden(PostMessageMultiplexer);
