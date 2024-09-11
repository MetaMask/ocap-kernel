import './endoify.js';
import * as snapsUtils from '@metamask/snaps-utils';
import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { vi, describe, it, expect } from 'vitest';

import { IframeManager } from './iframe-manager.js';
import type { IframeMessage } from './message.js';
import { Command } from './message.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

vi.mock('@metamask/snaps-utils', () => ({
  createWindow: vi.fn(),
}));

describe('IframeManager', () => {
  const makeGetPort =
    (port: MessagePort = new MessageChannel().port1) =>
    async (_window: Window): Promise<MessagePort> =>
      Promise.resolve(port);

  describe('create', () => {
    it('creates a new iframe', async () => {
      const mockWindow = {};
      vi.mocked(snapsUtils.createWindow).mockResolvedValueOnce(
        mockWindow as Window,
      );
      const manager = new IframeManager();
      const sendMessageSpy = vi
        .spyOn(manager, 'sendMessage')
        .mockImplementation(vi.fn());
      const [newWindow, id] = await manager.create({ getPort: makeGetPort() });

      expect(newWindow).toBe(mockWindow);
      expect(id).toBeTypeOf('string');
      expect(sendMessageSpy).toHaveBeenCalledOnce();
      expect(sendMessageSpy).toHaveBeenCalledWith(id, {
        type: Command.Ping,
        data: null,
      });
    });

    it('creates a new iframe with a specified id', async () => {
      const mockWindow = {};
      vi.mocked(snapsUtils.createWindow).mockResolvedValueOnce(
        mockWindow as Window,
      );

      const manager = new IframeManager();
      const sendMessageSpy = vi
        .spyOn(manager, 'sendMessage')
        .mockImplementation(vi.fn());
      const id = 'foo';
      const [newWindow, returnedId] = await manager.create({
        id,
        getPort: makeGetPort(),
      });

      expect(newWindow).toBe(mockWindow);
      expect(returnedId).toBe(id);
      expect(sendMessageSpy).toHaveBeenCalledOnce();
      expect(sendMessageSpy).toHaveBeenCalledWith(id, {
        type: Command.Ping,
        data: null,
      });
    });

    it('creates a new iframe with the default getPort function', async () => {
      vi.resetModules();
      vi.doMock('@ocap/streams', () => ({
        initializeMessageChannel: vi.fn(),
        makeMessagePortStreamPair: vi.fn(() => ({ reader: {}, writer: {} })),
        MessagePortReader: class Mock1 {},
        MessagePortWriter: class Mock2 {},
      }));
      const IframeManager2 = (await import('./iframe-manager.js'))
        .IframeManager;

      const mockWindow = {};
      vi.mocked(snapsUtils.createWindow).mockResolvedValueOnce(
        mockWindow as Window,
      );
      const manager = new IframeManager2();
      const sendMessageSpy = vi
        .spyOn(manager, 'sendMessage')
        .mockImplementation(vi.fn());
      const [newWindow, id] = await manager.create();

      expect(newWindow).toBe(mockWindow);
      expect(id).toBeTypeOf('string');
      expect(sendMessageSpy).toHaveBeenCalledOnce();
      expect(sendMessageSpy).toHaveBeenCalledWith(id, {
        type: Command.Ping,
        data: null,
      });
    });
  });

  describe('delete', () => {
    it('deletes an iframe', async () => {
      const id = 'foo';
      const iframe = document.createElement('iframe');
      iframe.id = `ocap-iframe-${id}`;
      const removeSpy = vi.spyOn(iframe, 'remove');

      vi.mocked(snapsUtils.createWindow).mockImplementationOnce(async () => {
        document.body.appendChild(iframe);
        return iframe.contentWindow as Window;
      });

      const manager = new IframeManager();
      vi.spyOn(manager, 'sendMessage').mockImplementation(vi.fn());

      await manager.create({ id, getPort: makeGetPort() });
      await manager.delete(id);

      expect(removeSpy).toHaveBeenCalledOnce();
    });

    it('ignores attempt to delete unrecognized iframe', async () => {
      const id = 'foo';
      const manager = new IframeManager();
      const iframe = document.createElement('iframe');

      const removeSpy = vi.spyOn(iframe, 'remove');
      await manager.delete(id);

      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('warns of unresolved messages', async () => {
      const id = 'foo';
      const messageCount = 7;
      const awaitCount = 2;

      vi.mocked(snapsUtils.createWindow).mockImplementationOnce(vi.fn());

      const manager = new IframeManager();

      vi.spyOn(manager, 'sendMessage').mockImplementationOnce(vi.fn());

      const { port1, port2 } = new MessageChannel();

      await manager.create({ id, getPort: makeGetPort(port1) });

      const warnSpy = vi.spyOn(console, 'warn');

      const messagePromises = Array(messageCount)
        .fill(0)
        .map(async (_, i) =>
          manager.sendMessage(id, { type: Command.Evaluate, data: `${i}+1` }),
        );

      // resolve the first `awaitCount` promises
      for (let i = 0; i < awaitCount; i++) {
        port2.postMessage({
          done: false,
          value: {
            label: 'message',
            payload: {
              id: `foo-${i + 1}`,
              message: {
                type: Command.Evaluate,
                data: `${i + 1}`,
              },
            },
          },
        });
        await messagePromises[i];
      }

      await manager.delete(id);
      expect(warnSpy).toHaveBeenCalledTimes(messageCount - awaitCount);
      // This test assumes messageIds begin at 1, not 0
      expect(warnSpy).toHaveBeenLastCalledWith(
        `Unhandled orphaned message: ${id}-${messageCount}`,
      );
    });
  });

  describe('capTp', () => {
    it('throws if called before initialization', async () => {
      const mockWindow = {};
      vi.mocked(snapsUtils.createWindow).mockResolvedValueOnce(
        mockWindow as Window,
      );
      const manager = new IframeManager();
      vi.spyOn(manager, 'sendMessage').mockImplementation(vi.fn());
      const [, id] = await manager.create({ getPort: makeGetPort() });

      await expect(
        async () =>
          await manager.callCapTp(id, {
            method: 'whatIsTheGreatFrangooly',
            params: [],
          }),
      ).rejects.toThrow(/does not have a CapTP connection\.$/u);
    });

    it('throws if initialization is called twice on the same vat', async () => {
      const id = 'frangooly';

      const capTpInit = {
        query: {
          label: 'message',
          payload: {
            id: `${id}-1`,
            message: {
              data: null,
              type: 'makeCapTp',
            },
          },
        },
        response: {
          label: 'message',
          payload: {
            id: `${id}-1`,
            message: {
              type: 'makeCapTp',
              data: null,
            },
          },
        },
      };

      vi.mocked(snapsUtils.createWindow).mockImplementationOnce(vi.fn());

      const { port1, port2 } = new MessageChannel();
      const port1PostMessageSpy = vi
        .spyOn(port1, 'postMessage')
        .mockImplementation(vi.fn());

      let port1PostMessageCallCounter: number = 0;
      const expectSendMessageToHaveBeenCalledOnceMoreWith = (
        expectation: unknown,
      ): void => {
        port1PostMessageCallCounter += 1;
        expect(port1PostMessageSpy).toHaveBeenCalledTimes(
          port1PostMessageCallCounter,
        );
        expect(port1PostMessageSpy).toHaveBeenLastCalledWith({
          done: false,
          value: expectation,
        });
      };

      const mockReplyWith = (message: unknown): void =>
        port2.postMessage({
          done: false,
          value: message,
        });

      const manager = new IframeManager();

      vi.spyOn(manager, 'sendMessage').mockImplementationOnce(vi.fn());

      await manager.create({ id, getPort: makeGetPort(port1) });

      // Init CapTP connection
      const initCapTpPromise = manager.makeCapTp(id);

      expectSendMessageToHaveBeenCalledOnceMoreWith(capTpInit.query);
      mockReplyWith(capTpInit.response);

      await initCapTpPromise.then((resolvedValue) =>
        console.debug(`CapTp initialized: ${JSON.stringify(resolvedValue)}`),
      );

      await expect(async () => await manager.makeCapTp(id)).rejects.toThrow(
        /already has a CapTP connection\./u,
      );
    });

    it('does TheGreatFrangooly', async () => {
      const id = 'frangooly';

      const capTpInit = {
        query: {
          label: 'message',
          payload: {
            id: `${id}-1`,
            message: {
              data: null,
              type: 'makeCapTp',
            },
          },
        },
        response: {
          label: 'message',
          payload: {
            id: `${id}-1`,
            message: {
              type: 'makeCapTp',
              data: null,
            },
          },
        },
      };

      const greatFrangoolyBootstrap = {
        query: {
          label: 'capTp',
          payload: {
            epoch: 0,
            questionID: 'q-1',
            type: 'CTP_BOOTSTRAP',
          },
        },
        response: {
          label: 'capTp',
          payload: {
            type: 'CTP_RETURN',
            epoch: 0,
            answerID: 'q-1',
            result: {
              body: '{"@qclass":"slot","iface":"Alleged: TheGreatFrangooly","index":0}',
              slots: ['o+1'],
            },
          },
        },
      };

      const greatFrangoolyCall = {
        query: {
          label: 'capTp',
          payload: {
            type: 'CTP_CALL',
            epoch: 0,
            method: {
              body: '["whatIsTheGreatFrangooly",[]]',
              slots: [],
            },
            questionID: 'q-2',
            target: 'o-1',
          },
        },
        response: {
          label: 'capTp',
          payload: {
            type: 'CTP_RETURN',
            epoch: 0,
            answerID: 'q-2',
            result: {
              body: '"Crowned with Chaos"',
              slots: [],
            },
          },
        },
      };

      vi.mocked(snapsUtils.createWindow).mockImplementationOnce(vi.fn());

      const { port1, port2 } = new MessageChannel();
      const port1PostMessageSpy = vi
        .spyOn(port1, 'postMessage')
        .mockImplementation(vi.fn());

      let port1PostMessageCallCounter: number = 0;
      const expectSendMessageToHaveBeenCalledOnceMoreWith = (
        expectation: unknown,
      ): void => {
        port1PostMessageCallCounter += 1;
        expect(port1PostMessageSpy).toHaveBeenCalledTimes(
          port1PostMessageCallCounter,
        );
        expect(port1PostMessageSpy).toHaveBeenLastCalledWith({
          done: false,
          value: expectation,
        });
      };

      const mockReplyWith = (message: unknown): void =>
        port2.postMessage({
          done: false,
          value: message,
        });

      const manager = new IframeManager();

      vi.spyOn(manager, 'sendMessage').mockImplementationOnce(vi.fn());

      await manager.create({ id, getPort: makeGetPort(port1) });

      // Init CapTP connection
      const initCapTpPromise = manager.makeCapTp(id);

      expectSendMessageToHaveBeenCalledOnceMoreWith(capTpInit.query);
      mockReplyWith(capTpInit.response);

      await initCapTpPromise.then((resolvedValue) =>
        console.debug(`CapTp initialized: ${JSON.stringify(resolvedValue)}`),
      );

      // Bootstrap TheGreatFrangooly...
      const callCapTpResponse = manager.callCapTp(id, {
        method: 'whatIsTheGreatFrangooly',
        params: [],
      });

      expectSendMessageToHaveBeenCalledOnceMoreWith(
        greatFrangoolyBootstrap.query,
      );
      mockReplyWith(greatFrangoolyBootstrap.response);

      await delay().then(() =>
        console.debug('TheGreatFrangooly bootstrapped...'),
      );

      // ...and call it.
      expectSendMessageToHaveBeenCalledOnceMoreWith(greatFrangoolyCall.query);
      mockReplyWith(greatFrangoolyCall.response);

      await callCapTpResponse.then((resolvedValue) =>
        console.debug(
          `TheGreatFrangooly called: ${JSON.stringify(resolvedValue)}`,
        ),
      );

      expect(await callCapTpResponse).equals('Crowned with Chaos');
    });
  });

  describe('sendMessage', () => {
    it('sends a message to an iframe', async () => {
      vi.mocked(snapsUtils.createWindow).mockResolvedValueOnce({} as Window);

      const manager = new IframeManager();
      const sendMessageSpy = vi.spyOn(manager, 'sendMessage');
      // Intercept the ping message in create()
      sendMessageSpy.mockImplementationOnce(async () => Promise.resolve());

      const { port1, port2 } = new MessageChannel();
      const portPostMessageSpy = vi.spyOn(port1, 'postMessage');
      const id = 'foo';
      await manager.create({ id, getPort: makeGetPort(port1) });

      const message: IframeMessage = { type: Command.Evaluate, data: '2+2' };
      const response: IframeMessage = { type: Command.Evaluate, data: '4' };

      // sendMessage wraps the payload in a 'message' envelope
      const messagePromise = manager.sendMessage(id, message);
      const messageId: string | undefined =
        portPostMessageSpy.mock.lastCall?.[0]?.value?.payload?.id;
      expect(messageId).toBeTypeOf('string');

      // postMessage sends the json directly, so we have to wrap it in an envelope here
      port2.postMessage({
        done: false,
        value: {
          label: 'message',
          payload: {
            id: messageId,
            message: response,
          },
        },
      });

      // awaiting event loop should resolve the messagePromise
      expect(await messagePromise).toBe(response.data);

      // messagePromise doesn't resolve until message was posted
      expect(portPostMessageSpy).toHaveBeenCalledOnce();
      expect(portPostMessageSpy).toHaveBeenCalledWith({
        done: false,
        value: {
          label: 'message',
          payload: {
            id: messageId,
            message,
          },
        },
      });
    });

    it('throws if iframe not found', async () => {
      const manager = new IframeManager();
      const id = 'foo';
      const message: IframeMessage = { type: Command.Ping, data: null };

      await expect(manager.sendMessage(id, message)).rejects.toThrow(
        `No vat with id "${id}"`,
      );
    });
  });

  describe('miscellaneous', () => {
    it('calls console.warn when receiving unexpected message', async () => {
      vi.mocked(snapsUtils.createWindow).mockResolvedValueOnce({} as Window);

      const manager = new IframeManager();
      const warnSpy = vi.spyOn(console, 'warn');
      const sendMessageSpy = vi.spyOn(manager, 'sendMessage');
      // Intercept the ping message in create()
      sendMessageSpy.mockImplementationOnce(async () => Promise.resolve());

      const { port1, port2 } = new MessageChannel();
      await manager.create({ getPort: makeGetPort(port1) });

      port2.postMessage({ done: false, value: 'foo' });
      await delay(10);

      expect(warnSpy).toHaveBeenCalledWith(
        'Offscreen received message with unexpected format',
        'foo',
      );
    });

    it('calls console.error when receiving message with unknown id', async () => {
      vi.mocked(snapsUtils.createWindow).mockResolvedValueOnce({} as Window);

      const manager = new IframeManager();
      const errorSpy = vi.spyOn(console, 'error');
      const sendMessageSpy = vi.spyOn(manager, 'sendMessage');
      // Intercept the ping message in create()
      sendMessageSpy.mockImplementationOnce(async () => Promise.resolve());

      const { port1, port2 } = new MessageChannel();
      await manager.create({ getPort: makeGetPort(port1) });

      port2.postMessage({
        done: false,
        value: {
          label: 'message',
          payload: {
            id: 'foo',
            message: {
              type: Command.Evaluate,
              data: '"bar"',
            },
          },
        },
      });
      await delay(10);

      expect(errorSpy).toHaveBeenCalledWith(
        'No unresolved message with id "foo".',
      );
    });
  });
});
