import { hasProperty, isObject } from '@metamask/utils';

export type Connection<Incoming, Outgoing> = {
  open?: () => Promise<void>;
  sendMessage: (message: Outgoing) => Promise<void>;
  setMessageHandler: (handler: (message: Incoming) => Promise<void>) => void;
  close: () => Promise<void>;
};

export const isConnection = <Incoming = unknown, Outgoing = unknown>(
  value: unknown,
): value is Connection<Incoming, Outgoing> =>
  isObject(value) &&
  (!hasProperty(value, 'open') || typeof value.open === 'function') &&
  typeof value.sendMessage === 'function' &&
  typeof value.setMessageHandler === 'function' &&
  typeof value.close === 'function';
