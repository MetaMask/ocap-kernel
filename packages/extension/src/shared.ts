import { isObject } from '@metamask/utils';
import {
  isCommand,
  isCommandReply,
  type Command,
  type CommandReply,
} from '@ocap/utils';

export type VatId = string;

export enum ExtensionMessageTarget {
  Background = 'background',
  Offscreen = 'offscreen',
}

export type ExtensionRuntimeMessage = {
  payload: Command | CommandReply;
  target: ExtensionMessageTarget;
};

export const isExtensionRuntimeMessage = (
  message: unknown,
): message is ExtensionRuntimeMessage =>
  isObject(message) &&
  typeof message.target === 'string' &&
  Object.values(ExtensionMessageTarget).includes(
    message.target as ExtensionMessageTarget,
  ) &&
  (isCommand(message.payload) || isCommandReply(message.payload));

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
