/**
 * This module provides a pair of classes for creating readable and writable streams
 * over a [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).
 * function.
 *
 * @module PostMessage streams
 */

import type { Json } from '@metamask/utils';

import { BaseDuplexStream } from './BaseDuplexStream.js';
import type { BaseReaderArgs, ValidateInput, OnEnd } from './BaseStream.js';
import { BaseReader, BaseWriter } from './BaseStream.js';
// Used in docstring.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Dispatchable, OnMessage, PostMessage } from './utils.js';

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
export class PostMessageReader<Read extends Json> extends BaseReader<Read> {
  constructor(
    setListener: SetListener,
    removeListener: RemoveListener,
    { validateInput, onEnd }: BaseReaderArgs<Read> = {},
  ) {
    // eslint-disable-next-line prefer-const
    let onMessage: OnMessage;

    super({
      validateInput,
      onEnd: async () => {
        removeListener(onMessage);
        await onEnd?.();
      },
    });

    const receiveInput = super.getReceiveInput();
    onMessage = (messageEvent) => {
      if (messageEvent.ports && messageEvent.ports.length > 0) {
        return;
      }

      receiveInput(messageEvent.data);
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
export class PostMessageWriter<Write extends Json> extends BaseWriter<Write> {
  constructor(postMessageFn: PostMessage, onEnd?: OnEnd) {
    super('PostMessageWriter', postMessageFn, onEnd);
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
  Read extends Json,
  Write extends Json = Read,
> extends BaseDuplexStream<
  Read,
  PostMessageReader<Read>,
  Write,
  PostMessageWriter<Write>
> {
  // Unavoidable exception to our preference for #-private names.
  // eslint-disable-next-line no-restricted-syntax
  private constructor(
    postMessageFn: PostMessage,
    setListener: SetListener,
    removeListener: RemoveListener,
    validateInput?: ValidateInput<Read>,
  ) {
    let writer: PostMessageWriter<Write>; // eslint-disable-line prefer-const
    const reader = new PostMessageReader<Read>(setListener, removeListener, {
      validateInput,
      onEnd: async () => {
        await writer.return();
      },
    });
    writer = new PostMessageWriter<Write>(postMessageFn, async () => {
      await reader.return();
    });
    super(reader, writer);
  }

  static async make<Read extends Json, Write extends Json = Read>(
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
