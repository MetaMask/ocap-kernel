/**
 * This module provides a pair of classes for creating readable and writable streams
 * over a [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).
 * function.
 *
 * Due to its close coupling with the browser PostMessage API, this stream does not
 * support multiplexing.
 *
 * @module PostMessage streams
 */

import { isObject } from '@metamask/utils';

import type { OnMessage, PostMessage } from './utils.js';
import {
  BaseDuplexStream,
  isDuplexStreamSignal,
  makeDuplexStreamInputValidator,
} from '../BaseDuplexStream.js';
import type { BaseReaderArgs, BaseWriterArgs } from '../BaseStream.js';
import { BaseReader, BaseWriter } from '../BaseStream.js';
import { isSignalLike } from '../utils.js';
import type { Dispatchable } from '../utils.js';

export type PostMessageTarget = {
  addEventListener: (type: 'message', listener: OnMessage) => void;
  removeEventListener: (type: 'message', listener: OnMessage) => void;
  postMessage: PostMessage;
};

type PostMessageReaderArgs<Read> = BaseReaderArgs<Read> & {
  messageTarget: PostMessageTarget;
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
    validateInput,
    onEnd,
    messageTarget,
    messageEventMode = 'data',
  }: PostMessageReaderArgs<Read>) {
    // eslint-disable-next-line prefer-const
    let onMessage: OnMessage;

    super({
      validateInput,
      onEnd: async (error) => {
        messageTarget.removeEventListener('message', onMessage);
        await onEnd?.(error);
      },
    });

    const receiveInput = super.getReceiveInput();
    onMessage = (messageEvent) => {
      const value =
        messageEventMode === 'data' ||
        isSignalLike(messageEvent.data) ||
        isDuplexStreamSignal(messageEvent.data)
          ? messageEvent.data
          : messageEvent;
      receiveInput(value).catch(async (error) => this.throw(error));
    };
    messageTarget.addEventListener('message', onMessage);

    harden(this);
  }
}
harden(PostMessageReader);

export type PostMessageEnvelope<Write> = {
  payload: Write;
  transfer: Transferable[];
};

const isPostMessageEnvelope = <Write>(
  value: unknown,
): value is PostMessageEnvelope<Write> =>
  isObject(value) &&
  typeof value.payload !== 'undefined' &&
  Array.isArray(value.transfer);

/**
 * A writable stream over a {@link PostMessage} function.
 *
 * @see {@link PostMessageReader} for the corresponding readable stream.
 */
export class PostMessageWriter<Write> extends BaseWriter<
  PostMessageEnvelope<Write>
> {
  constructor(
    messageTarget: PostMessageTarget,
    { name, onEnd }: Omit<BaseWriterArgs<Write>, 'onDispatch'> = {},
  ) {
    super({
      name,
      onDispatch: (value: Dispatchable<PostMessageEnvelope<Write>>) =>
        isPostMessageEnvelope(value)
          ? messageTarget.postMessage(value.payload, value.transfer)
          : messageTarget.postMessage(value),
      onEnd: async (error) => {
        await onEnd?.(error);
      },
    });
    harden(this);
  }
}
harden(PostMessageWriter);

type PostMessageDuplexStreamArgs<Read> = PostMessageReaderArgs<Read>;

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
  PostMessageEnvelope<Write>,
  PostMessageWriter<Write>
> {
  constructor({
    messageTarget,
    validateInput,
    ...args
  }: PostMessageDuplexStreamArgs<Read>) {
    let writer: PostMessageWriter<Write>; // eslint-disable-line prefer-const
    const reader = new PostMessageReader<Read>({
      ...args,
      messageTarget,
      validateInput: makeDuplexStreamInputValidator(validateInput),
      onEnd: async () => {
        await writer.return();
      },
    } as PostMessageReaderArgs<Read>);
    writer = new PostMessageWriter<Write>(messageTarget, {
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
