/**
 * This module provides a pair of classes for creating readable and writable streams
 * over a [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).
 * function.
 *
 * @module PostMessage streams
 */

import type { Json } from '@metamask/utils';

import { BaseDuplexStream } from './BaseDuplexStream.js';
import type { OnEnd } from './BaseStream.js';
import { BaseReader, BaseWriter } from './BaseStream.js';

type PostMessage = (message: unknown) => void;
type OnMessage = (event: MessageEvent<unknown>) => void;

type SetListener = (onMessage: OnMessage) => void;
type RemoveListener = (onMessage: OnMessage) => void;

/**
 * A readable stream over a {@link PostMessage} function.
 *
 * @see {@link PostMessageWriter} for the corresponding writable stream.
 */
export class PostMessageReader<Read extends Json> extends BaseReader<Read> {
  constructor(
    setListener: SetListener,
    removeListener: RemoveListener,
    onEnd?: OnEnd,
  ) {
    // eslint-disable-next-line prefer-const
    let onMessage: OnMessage;

    super(async () => {
      removeListener(onMessage);
      await onEnd?.();
    });

    const receiveInput = super.getReceiveInput();
    onMessage = (messageEvent) => receiveInput(messageEvent.data);
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
  constructor(
    postMessageFn: PostMessage,
    setListener: SetListener,
    removeListener: RemoveListener,
  ) {
    let writer: PostMessageWriter<Write>; // eslint-disable-line prefer-const
    const reader = new PostMessageReader<Read>(
      setListener,
      removeListener,
      async () => {
        await writer.return();
      },
    );
    writer = new PostMessageWriter<Write>(postMessageFn, async () => {
      await reader.return();
    });
    super(reader, writer);
  }
}
harden(PostMessageDuplexStream);
