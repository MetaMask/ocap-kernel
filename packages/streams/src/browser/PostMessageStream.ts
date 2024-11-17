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
import type {
  BaseReaderArgs,
  BaseWriterArgs,
  ValidateInput,
} from '../BaseStream.js';
import { BaseReader, BaseWriter } from '../BaseStream.js';
import {
  isMultiplexEnvelope,
  StreamMultiplexer,
} from '../StreamMultiplexer.js';
import type { Dispatchable } from '../utils.js';

type SetListener = (onMessage: OnMessage) => void;
type RemoveListener = (onMessage: OnMessage) => void;

/**
 * A readable stream over a {@link PostMessage} function.
 *
 * Ignores message events dispatched on its port that contain ports, but otherwise
 * expects {@link Dispatchable} values to be posted to its port.
 *
 * @see {@link PostMessageWriter} for the corresponding writable stream.
 */
export class PostMessageReader<Read> extends BaseReader<Read> {
  constructor(
    setListener: SetListener,
    removeListener: RemoveListener,
    { validateInput, onEnd }: BaseReaderArgs<Read> = {},
  ) {
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
      if (messageEvent.ports && messageEvent.ports.length > 0) {
        return;
      }

      receiveInput(messageEvent.data).catch(async (error) => this.throw(error));
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
  constructor(
    postMessageFn: PostMessage,
    setListener: SetListener,
    removeListener: RemoveListener,
    validateInput?: ValidateInput<Read>,
  ) {
    let writer: PostMessageWriter<Write>; // eslint-disable-line prefer-const
    const reader = new PostMessageReader<Read>(setListener, removeListener, {
      name: 'PostMessageDuplexStream',
      validateInput: makeDuplexStreamInputValidator(validateInput),
      onEnd: async () => {
        await writer.return();
      },
    });
    writer = new PostMessageWriter<Write>(postMessageFn, {
      name: 'PostMessageDuplexStream',
      onEnd: async () => {
        await reader.return();
      },
    });
    super(reader, writer);
  }

  static async make<Read, Write = Read>(
    postMessageFn: PostMessage,
    setListener: SetListener,
    removeListener: RemoveListener,
    validateInput?: ValidateInput<Read>,
  ): Promise<PostMessageDuplexStream<Read, Write>> {
    const stream = new PostMessageDuplexStream<Read, Write>(
      postMessageFn,
      setListener,
      removeListener,
      validateInput,
    );
    await stream.synchronize();
    return stream;
  }
}
harden(PostMessageDuplexStream);

export class PostMessageMultiplexer extends StreamMultiplexer {
  constructor(
    postMessageFn: PostMessage,
    setListener: SetListener,
    removeListener: RemoveListener,
    name?: string,
  ) {
    super(
      new PostMessageDuplexStream(
        postMessageFn,
        setListener,
        removeListener,
        isMultiplexEnvelope,
      ),
      name,
    );
    harden(this);
  }
}
harden(PostMessageMultiplexer);
