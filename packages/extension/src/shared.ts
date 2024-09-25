import { isObject } from '@metamask/utils';
import type { Command, CommandReply } from '@ocap/utils';
import { isCommand, isCommandReply } from '@ocap/utils';

export type VatId = string;

export enum ExtensionMessageTarget {
  Background = 'background',
  Offscreen = 'offscreen',
}

export type ExtensionRuntimeMessage = {
  // There is overlap between the Evaluate type of Command and CommandReply.
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
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
