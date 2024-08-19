import { isObject } from '@metamask/utils';

export enum Command {
  Evaluate = 'evaluate',
  Ping = 'ping',
}

export type ExtensionMessage<
  Type extends Command,
  Data extends null | string | unknown[] | Record<string, unknown>,
> = {
  type: Type;
  target: 'background' | 'offscreen';
  data: Data;
};

export type IframeMessage<
  Type extends Command,
  Data extends null | string | unknown[] | Record<string, unknown>,
> = {
  type: Type;
  data: Data;
};

export type WrappedIframeMessage = {
  id: string;
  message: IframeMessage<Command, string>;
};

export const isWrappedIframeMessage = (
  value: unknown,
): value is WrappedIframeMessage =>
  isObject(value) &&
  typeof value.id === 'string' &&
  isObject(value.message) &&
  typeof value.message.type === 'string' &&
  (typeof value.message.data === 'string' || value.message.data === null);

/**
 * Wrap an async callback to ensure any errors are at least logged.
 *
 * @param callback - The async callback to wrap.
 * @returns The wrapped callback.
 */
export const makeHandledCallback = <Args extends unknown[]>(
  callback: (...args: Args) => Promise<void>,
) => {
  return (...args: Args): void => {
    // eslint-disable-next-line n/no-callback-literal, n/callback-return
    callback(...args).catch(console.error);
  };
};
