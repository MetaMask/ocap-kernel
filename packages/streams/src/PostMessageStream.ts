/**
 * This module provides a pair of classes for creating readable and writable streams
 * over a [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).
 * function.
 *
 * @module PostMessage streams
 */

import type { Json } from '@metamask/utils';

import { BaseReader, BaseWriter } from './BaseStream.js';
import type { StreamPair } from './utils.js';

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
    onEnd?: () => void,
  ) {
    // eslint-disable-next-line prefer-const
    let onMessage: OnMessage;

    super(() => {
      removeListener(onMessage);
      onEnd?.();
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
  constructor(postMessageFn: PostMessage) {
    super('PostMessageWriter');
    super.setOnDispatch(postMessageFn);
    harden(this);
  }
}
harden(PostMessageWriter);

/**
 * Makes a reader / writer pair over the same {@link PostMessage} function, and provides
 * convenience methods for cleaning them up.
 *
 * @param postMessageFn - The postMessage function to make the streams over.
 * @param setListener - The function to set the listener on the postMessage function.
 * @param removeListener - The function to remove the listener from the postMessage function.
 * @returns The reader and writer streams, and cleanup methods.
 */
export const makePostMessageStreamPair = <
  Read extends Json,
  Write extends Json = Read,
>(
  postMessageFn: PostMessage,
  setListener: SetListener,
  removeListener: RemoveListener,
): StreamPair<Read, Write> => {
  const reader = new PostMessageReader<Read>(setListener, removeListener);
  const writer = new PostMessageWriter<Write>(postMessageFn);

  return harden({
    reader,
    writer,
    return: async () =>
      Promise.all([writer.return(), reader.return()]).then(() => undefined),
    throw: async (error: Error) =>
      Promise.all([writer.throw(error), reader.return()]).then(() => undefined),
  });
};
