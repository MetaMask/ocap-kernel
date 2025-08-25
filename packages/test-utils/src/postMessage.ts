import { vi } from 'vitest';
import type { Mock } from 'vitest';

export const makeMockMessageTarget = (): {
  postMessage: Mock<(message: unknown) => void>;
  addEventListener: Mock<
    (_type: 'message', listener: (event: MessageEvent) => void) => void
  >;
  removeEventListener: Mock<
    (_type: 'message', listener: (event: MessageEvent) => void) => void
  >;
  listeners: ((payload: unknown) => void)[];
} => {
  const listeners: ((payload: unknown) => void)[] = [];
  const postMessage = vi.fn((message: unknown) => {
    listeners.forEach((listener) =>
      listener(
        message instanceof MessageEvent
          ? message
          : new MessageEvent('message', { data: message }),
      ),
    );
  });
  const addEventListener = vi.fn(
    (_type: 'message', listener: (event: MessageEvent) => void) => {
      listeners.push(listener as (payload: unknown) => void);
    },
  );
  const removeEventListener = vi.fn(
    (_type: 'message', listener: (event: MessageEvent) => void) => {
      listeners.splice(
        listeners.indexOf(listener as (payload: unknown) => void),
        1,
      );
    },
  );
  return {
    postMessage,
    addEventListener,
    removeEventListener,
    listeners,
  };
};
