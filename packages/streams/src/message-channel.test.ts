import { JSDOM } from 'jsdom';
import { vi, describe, it, beforeEach, afterEach, beforeAll } from 'vitest';

import {
  initializeMessageChannel,
  MessageType,
  receiveMessagePort,
} from './message-channel';

vi.mock('@endo/promise-kit', () => ({
  makePromiseKit: () => {
    let resolve: (value: unknown) => void, reject: (reason?: unknown) => void;
    const promise = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    // @ts-expect-error We have in fact assigned resolve and reject.
    return { promise, resolve, reject };
  },
}));

describe.concurrent('initializeMessageChannel', () => {
  it('calls targetWindow.postMessage', async ({ expect }) => {
    const targetWindow = new JSDOM().window;
    const postMessageSpy = vi.spyOn(targetWindow, 'postMessage');
    // We intentionally let this one go. It will never settle.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    initializeMessageChannel(targetWindow as unknown as Window);

    expect(postMessageSpy).toHaveBeenCalledOnce();
    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        type: MessageType.Initialize,
        port: expect.any(MessagePort),
      },
      '*',
    );
  });

  it('resolves a port with no message handler once sent acknowledgment via message channel', async ({
    expect,
  }) => {
    const targetWindow = new JSDOM().window;
    const postMessageSpy = vi.spyOn(targetWindow, 'postMessage');
    const messageChannelP = initializeMessageChannel(
      targetWindow as unknown as Window,
    );

    const remotePort: MessagePort = postMessageSpy.mock.lastCall?.[0].port;
    remotePort.postMessage({ type: MessageType.Acknowledge });

    const resolvedValue = await messageChannelP;
    expect(resolvedValue).toBeInstanceOf(MessagePort);
    expect(resolvedValue.onmessage).toBe(null);
  });

  it.for([
    { type: MessageType.Initialize },
    { type: 'foo' },
    { foo: 'bar' },
    {},
    [],
    'foo',
    400,
    null,
    undefined,
  ])(
    'rejects if sent unexpected message via message channel: %#',
    async (unexpectedMessage, { expect }) => {
      const targetWindow = new JSDOM().window;
      const postMessageSpy = vi.spyOn(targetWindow, 'postMessage');
      const messageChannelP = initializeMessageChannel(
        targetWindow as unknown as Window,
      );

      const remotePort: MessagePort = postMessageSpy.mock.lastCall?.[0].port;
      remotePort.postMessage(unexpectedMessage);

      await expect(messageChannelP).rejects.toThrow(
        /^Received unexpected message via message port/u,
      );
    },
  );
});

describe('receiveMessagePort', () => {
  let messageEventListeners: [string, EventListenerOrEventListenerObject][] =
    [];
  let originalAddEventListener: typeof window.addEventListener;

  beforeAll(() => {
    originalAddEventListener = window.addEventListener;
  });

  beforeEach(() => {
    // JSDOM apparently affords no way to clear all event listeners between test runs,
    // so we have to do it manually.
    window.addEventListener = (
      ...args: Parameters<typeof window.addEventListener>
    ) => {
      messageEventListeners.push([args[0], args[1]]);
      originalAddEventListener.call(window, ...args);
    };
  });

  afterEach(() => {
    messageEventListeners.forEach(([messageType, listener]) => {
      window.removeEventListener(messageType, listener);
    });
    messageEventListeners = [];
    window.addEventListener = originalAddEventListener;
  });

  it('receives and acknowledges a message port', async ({ expect }) => {
    const messagePortP = receiveMessagePort();

    const { port2 } = new MessageChannel();
    const portPostMessageSpy = vi.spyOn(port2, 'postMessage');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: MessageType.Initialize, port: port2 },
      }),
    );

    const resolvedValue = await messagePortP;

    expect(resolvedValue).toBe(port2);
    expect(portPostMessageSpy).toHaveBeenCalledOnce();
    expect(portPostMessageSpy).toHaveBeenCalledWith({
      type: MessageType.Acknowledge,
    });
  });

  it('cleans up event listeners', async ({ expect }) => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const messagePortP = receiveMessagePort();

    const { port2 } = new MessageChannel();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: MessageType.Initialize, port: port2 },
      }),
    );

    await messagePortP;

    expect(addEventListenerSpy).toHaveBeenCalledOnce();
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledOnce();
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );
  });

  it.for([
    { type: MessageType.Acknowledge },
    { type: 'foo' },
    { foo: 'bar' },
    {},
    [],
    'foo',
    400,
    null,
    undefined,
  ])(
    'ignores unexpected message events dispatched on window: %#',
    async (unexpectedMessage, { expect }) => {
      const messagePortP = receiveMessagePort();

      const { port2 } = new MessageChannel();
      const portPostMessageSpy = vi.spyOn(port2, 'postMessage');

      const fulfillmentDetector = vi.fn();
      messagePortP.finally(fulfillmentDetector);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: unexpectedMessage,
        }),
      );

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await null;

      expect(fulfillmentDetector).not.toHaveBeenCalled();
      expect(portPostMessageSpy).not.toHaveBeenCalled();
    },
  );
});
