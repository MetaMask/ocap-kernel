import type { makePromiseKit } from '@endo/promise-kit';
import * as snapsUtils from '@metamask/snaps-utils';
import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { vi, describe, it, expect } from 'vitest';

import { IframeManager } from './iframe-manager.js';
import { Command } from './shared.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

vi.mock('@metamask/snaps-utils', () => ({
  createWindow: vi.fn(),
}));

describe('IframeManager', () => {
  const makeGetPort =
    (port: MessagePort = new MessageChannel().port1) =>
    async (_window: Window) =>
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
        type: 'ping',
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
        type: 'ping',
        data: null,
      });
    });

    it('creates a new iframe with the default getPort function', async () => {
      vi.resetModules();
      vi.doMock('@ocap/streams', () => ({
        initializeMessageChannel: vi.fn(),
        makeMessagePortStreams: vi.fn(() => ({ reader: {}, writer: {} })),
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
        type: 'ping',
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

      const message = { type: Command.Evaluate, data: '2+2' };

      const messagePromise = manager.sendMessage(id, message);
      const messageId: string | undefined =
        portPostMessageSpy.mock.lastCall?.[0]?.id;
      expect(messageId).toBeTypeOf('string');

      port2.postMessage({
        id: messageId,
        message: {
          type: Command.Evaluate,
          data: '4',
        },
      });

      expect(portPostMessageSpy).toHaveBeenCalledOnce();
      expect(portPostMessageSpy).toHaveBeenCalledWith({
        id: messageId,
        message,
      });
      expect(await messagePromise).toBe('4');
    });

    it('throws if iframe not found', async () => {
      const manager = new IframeManager();
      const id = 'foo';
      const message = { type: Command.Ping, data: null };

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

      port2.postMessage('foo');
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
        id: 'foo',
        message: {
          type: Command.Evaluate,
          data: '"bar"',
        },
      });
      await delay(10);

      expect(errorSpy).toHaveBeenCalledWith(
        'No unresolved message with id "foo".',
      );
    });
  });
});
