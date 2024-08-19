import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { JSDOM } from 'jsdom';
import { vi, describe, it, beforeEach, afterEach, beforeAll } from 'vitest';

import {
  initializeMessageChannel,
  MessageType,
  receiveMessagePort,
} from './message-channel.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

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
      },
      '*',
      [expect.any(MessagePort)],
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

    // @ts-expect-error Wrong types for window.postMessage()
    const remotePort: MessagePort = postMessageSpy.mock.lastCall[2][0];
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

      // @ts-expect-error Wrong types for window.postMessage()
      const remotePort: MessagePort = postMessageSpy.mock.lastCall[2][0];
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
    ): void => {
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
        data: { type: MessageType.Initialize },
        ports: [port2],
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
        data: { type: MessageType.Initialize },
        ports: [port2],
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
    'ignores message events with unexpected data dispatched on window: %#',
    async (unexpectedMessage, { expect }) => {
      const messagePortP = receiveMessagePort();

      const { port2 } = new MessageChannel();
      const portPostMessageSpy = vi.spyOn(port2, 'postMessage');

      const fulfillmentDetector = vi.fn();
      messagePortP.then(fulfillmentDetector, fulfillmentDetector);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: unexpectedMessage,
        }),
      );

      await delay();

      expect(fulfillmentDetector).not.toHaveBeenCalled();
      expect(portPostMessageSpy).not.toHaveBeenCalled();
    },
  );

  it.for([{}, { ports: [] }, { ports: [{}, {}] }])(
    'ignores message events with unexpected ports dispatched on window: %#',
    async (unexpectedPorts, { expect }) => {
      const messagePortP = receiveMessagePort();

      const { port2 } = new MessageChannel();
      const portPostMessageSpy = vi.spyOn(port2, 'postMessage');

      const fulfillmentDetector = vi.fn();
      messagePortP.then(fulfillmentDetector, fulfillmentDetector);

      window.dispatchEvent(
        // @ts-expect-error Intentionally destructive testing.
        new MessageEvent('message', {
          data: { type: MessageType.Initialize },
          ...unexpectedPorts,
        }),
      );

      await delay();

      expect(fulfillmentDetector).not.toHaveBeenCalled();
      expect(portPostMessageSpy).not.toHaveBeenCalled();
    },
  );
});
