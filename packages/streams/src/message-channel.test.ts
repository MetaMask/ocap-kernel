import { delay } from '@ocap/test-utils';
import { vi, describe, it, beforeEach, afterEach, beforeAll } from 'vitest';

import {
  initializeMessageChannel,
  MessagePortReceiver,
  MessageType,
  receiveMessagePort,
} from './message-channel.js';

/**
 * Construct a mock Window with mock message post and listen capabilities.
 *
 * @returns A mock window which can postMessage and addEventListener.
 */
const createWindow = (): {
  postMessage: typeof Window.prototype.postMessage;
  addEventListener: typeof Window.prototype.addEventListener;
} => ({
  postMessage: vi.fn(),
  addEventListener: vi.fn(),
});

describe('initializeMessageChannel', () => {
  it('calls postMessage function', async ({ expect }) => {
    const targetWindow = createWindow();
    const postMessageSpy = vi.spyOn(targetWindow, 'postMessage');

    // We intentionally let this one go. It will never settle.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    initializeMessageChannel({
      postMessage: (message, transfer) =>
        targetWindow.postMessage(message, '*', transfer),
    });

    expect(postMessageSpy).toHaveBeenCalledOnce();
    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        type: MessageType.Initialize,
      },
      '*',
      [expect.any(MessagePort)],
    );
  });

  it('calls postMessage function, with id', async ({ expect }) => {
    const targetWindow = createWindow();
    const postMessageSpy = vi.spyOn(targetWindow, 'postMessage');

    // We intentionally let this one go. It will never settle.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    initializeMessageChannel({
      postMessage: (message, transfer) =>
        targetWindow.postMessage(message, '*', transfer),
      requestId: 'foo',
    });

    expect(postMessageSpy).toHaveBeenCalledOnce();
    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        type: MessageType.Initialize,
        id: 'foo',
      },
      '*',
      [expect.any(MessagePort)],
    );
  });

  it('resolves a port and removes event listeneronce sent acknowledgment via message channel', async ({
    expect,
  }) => {
    const { port1, port2 } = new MessageChannel();
    const removeEventListenerSpy = vi.spyOn(port1, 'removeEventListener');

    vi.spyOn(globalThis, 'MessageChannel').mockReturnValueOnce({
      port1,
      port2,
    });
    const messageChannelP = initializeMessageChannel({
      postMessage: vi.fn(),
    });

    port2.postMessage({ type: MessageType.Acknowledge });

    const resolvedValue = await messageChannelP;
    expect(resolvedValue).toBeInstanceOf(MessagePort);
    expect(removeEventListenerSpy).toHaveBeenCalledOnce();
  });

  it('only resolves once receiving an ack for the correct id if an id is provided', async ({
    expect,
  }) => {
    const { port1, port2 } = new MessageChannel();
    vi.spyOn(globalThis, 'MessageChannel').mockReturnValueOnce({
      port1,
      port2,
    });
    const messageChannelP = initializeMessageChannel({
      postMessage: vi.fn(),
      requestId: 'foo',
    });

    port2.postMessage({ type: MessageType.Acknowledge, id: 'bar' });
    expect(
      await Promise.race([messageChannelP, delay(10)]).then(() => undefined),
    ).toBeUndefined();

    port2.postMessage({ type: MessageType.Acknowledge, id: 'foo' });
    expect(await messageChannelP).toBe(port1);
  });

  it('has called portHandler with the local port by the time the promise resolves', async ({
    expect,
  }) => {
    const targetWindow = createWindow();
    const portHandler = vi.fn();
    const postMessageSpy = vi.spyOn(targetWindow, 'postMessage');
    const messageChannelP = initializeMessageChannel({
      postMessage: (message, transfer) =>
        targetWindow.postMessage(message, '*', transfer),
      portHandler,
    });

    // @ts-expect-error Wrong types for window.postMessage()
    const remotePort: MessagePort = postMessageSpy.mock.lastCall[2][0];
    remotePort.postMessage({ type: MessageType.Acknowledge });

    await messageChannelP;

    expect(portHandler).toHaveBeenCalledOnce();
    expect(portHandler).toHaveBeenCalledWith(expect.any(MessagePort));
    expect(portHandler.mock.lastCall?.[0] === remotePort).toBe(false);
  });

  it('resolves with the value returned by portHandler', async ({ expect }) => {
    const targetWindow = createWindow();
    const portHandler = vi.fn(() => 'foo');
    const postMessageSpy = vi.spyOn(targetWindow, 'postMessage');
    const messageChannelP = initializeMessageChannel({
      postMessage: (message, transfer) =>
        targetWindow.postMessage(message, '*', transfer),
      portHandler,
    });

    // @ts-expect-error Wrong types for window.postMessage()
    const remotePort: MessagePort = postMessageSpy.mock.lastCall[2][0];
    remotePort.postMessage({ type: MessageType.Acknowledge });

    expect(await messageChannelP).toBe('foo');
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
    'ignores unexpected messages from message channel: %#',
    async (unexpectedMessage, { expect }) => {
      const targetWindow = createWindow();
      const postMessageSpy = vi.spyOn(targetWindow, 'postMessage');
      const messageChannelP = initializeMessageChannel({
        postMessage: (message, transfer) =>
          targetWindow.postMessage(message, '*', transfer),
      });

      // @ts-expect-error Wrong types for window.postMessage()
      const remotePort: MessagePort = postMessageSpy.mock.lastCall[2][0];
      remotePort.postMessage(unexpectedMessage);

      expect(
        await Promise.race([messageChannelP, delay(10)]).then(() => undefined),
      ).toBeUndefined();
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
    const messagePortP = receiveMessagePort({
      addListener: (listener) => addEventListener('message', listener),
      removeListener: (listener) => removeEventListener('message', listener),
    });

    const { port2 } = new MessageChannel();
    const portPostMessageSpy = vi.spyOn(port2, 'postMessage');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: MessageType.Initialize },
        ports: [port2],
      }),
    );

    expect(await messagePortP).toBe(port2);
    expect(portPostMessageSpy).toHaveBeenCalledOnce();
    expect(portPostMessageSpy).toHaveBeenCalledWith({
      type: MessageType.Acknowledge,
    });
  });

  it('calls portHandler with the received port', async ({ expect }) => {
    const portHandler = vi.fn();
    const messagePortP = receiveMessagePort({
      addListener: (listener) => addEventListener('message', listener),
      removeListener: (listener) => removeEventListener('message', listener),
      portHandler,
    });

    const { port2 } = new MessageChannel();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: MessageType.Initialize },
        ports: [port2],
      }),
    );

    await messagePortP;

    expect(portHandler).toHaveBeenCalledOnce();
    expect(portHandler).toHaveBeenCalledWith(port2);
  });

  it('resolves with the value returned by portHandler', async ({ expect }) => {
    const portHandler = vi.fn(() => 'foo');
    const messagePortP = receiveMessagePort({
      addListener: (listener) => addEventListener('message', listener),
      removeListener: (listener) => removeEventListener('message', listener),
      portHandler,
    });

    const { port2 } = new MessageChannel();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: MessageType.Initialize },
        ports: [port2],
      }),
    );
    expect(await messagePortP).toBe('foo');
  });

  it('cleans up event listeners', async ({ expect }) => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const messagePortP = receiveMessagePort({
      addListener: (listener) => addEventListener('message', listener),
      removeListener: (listener) => removeEventListener('message', listener),
    });

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
    'ignores message events with unexpected data: %#',
    async (unexpectedMessage, { expect }) => {
      const messagePortP = receiveMessagePort({
        addListener: (listener) => addEventListener('message', listener),
        removeListener: (listener) => removeEventListener('message', listener),
      });

      const { port2 } = new MessageChannel();
      const portPostMessageSpy = vi.spyOn(port2, 'postMessage');

      window.dispatchEvent(
        new MessageEvent('message', {
          data: unexpectedMessage,
        }),
      );

      expect(
        await Promise.race([messagePortP, delay(10)]).then(() => undefined),
      ).toBeUndefined();
      expect(portPostMessageSpy).not.toHaveBeenCalled();
    },
  );

  it.for([
    {},
    { ports: [] },
    {
      ports: (() => {
        const { port1, port2 } = new MessageChannel();
        return [port1, port2];
      })(),
    },
  ])(
    'ignores message events with unexpected ports: %#',
    async (unexpectedPorts, { expect }) => {
      const messagePortP = receiveMessagePort({
        addListener: (listener) => addEventListener('message', listener),
        removeListener: (listener) => removeEventListener('message', listener),
      });

      const { port2 } = new MessageChannel();
      const portPostMessageSpy = vi.spyOn(port2, 'postMessage');

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: MessageType.Initialize },
          ...unexpectedPorts,
        }),
      );

      expect(
        await Promise.race([messagePortP, delay(10)]).then(() => undefined),
      ).toBeUndefined();
      expect(portPostMessageSpy).not.toHaveBeenCalled();
    },
  );

  it('throws if receiving an init message with a request id', async ({
    expect,
  }) => {
    const messagePortP = receiveMessagePort({
      addListener: (listener) => addEventListener('message', listener),
      removeListener: (listener) => removeEventListener('message', listener),
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: MessageType.Initialize, id: 'foo' },
        ports: [new MessageChannel().port1],
      }),
    );

    await expect(messagePortP).rejects.toThrow(
      'Received init message with request id. Use MessagePortReceiver instead.',
    );
  });
});

describe('MessagePortReceiver', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const makeMessagePortReceiver = () => {
    let listener: undefined | ((message: MessageEvent) => void);
    const removeListener = vi.fn();
    const receiver = new MessagePortReceiver(
      (_listener) => (listener = _listener),
      removeListener,
    );
    if (listener === undefined) {
      throw new Error('Listener not set');
    }
    return {
      receiver,
      listener,
      removeListener,
    };
  };

  it('constructs a MessagePortReceiver', ({ expect }) => {
    const messagePortReceiver = new MessagePortReceiver(vi.fn(), vi.fn());
    expect(messagePortReceiver).toBeInstanceOf(MessagePortReceiver);
  });

  it('receives a port, before request is received', async ({ expect }) => {
    const { receiver, listener } = makeMessagePortReceiver();

    const { port1 } = new MessageChannel();
    listener(
      new MessageEvent('message', {
        data: { type: MessageType.Initialize, id: 'foo' },
        ports: [port1],
      }),
    );

    expect(await receiver.receivePort('foo')).toBe(port1);
  });

  it('receives a port, after request is received', async ({ expect }) => {
    const { receiver, listener } = makeMessagePortReceiver();
    const receivePortP = receiver.receivePort('foo');

    const { port1 } = new MessageChannel();
    listener(
      new MessageEvent('message', {
        data: { type: MessageType.Initialize, id: 'foo' },
        ports: [port1],
      }),
    );

    expect(await receivePortP).toBe(port1);
  });

  it('rejects pending promises when destroyed', async ({ expect }) => {
    const { receiver, removeListener } = makeMessagePortReceiver();
    const receivePortP = receiver.receivePort('foo');

    expect(removeListener).not.toHaveBeenCalled();

    receiver.destroy();

    await expect(receivePortP).rejects.toThrow('MessagePortReceiver destroyed');
    expect(removeListener).toHaveBeenCalledOnce();
  });

  it('ignores non-init messages', async ({ expect }) => {
    const { receiver, listener } = makeMessagePortReceiver();
    const receivePortP = receiver.receivePort('foo');

    listener(new MessageEvent('message', { data: 'foo' }));

    await delay(0);
    // This would have happened after the promise's resolution if the message
    // had been an init message.
    receiver.destroy();

    await expect(receivePortP).rejects.toThrow('MessagePortReceiver destroyed');
  });

  it('logs an error if receiving an init message with undefined request id', async ({
    expect,
  }) => {
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const { listener } = makeMessagePortReceiver();

    listener(
      new MessageEvent('message', {
        data: { type: MessageType.Initialize },
        ports: [new MessageChannel().port1],
      }),
    );
    await delay();

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Received init message with undefined request id',
    );
  });
});
