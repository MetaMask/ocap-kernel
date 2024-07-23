import * as snapsUtils from '@metamask/snaps-utils';
import { vi, beforeEach, describe, it, expect } from 'vitest';

import { Command } from './shared';

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

vi.mock('@metamask/snaps-utils', () => ({
  createWindow: vi.fn(),
}));

describe('IframeManager', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let IframeManager: typeof import('./iframe-manager').IframeManager;

  beforeEach(async () => {
    vi.resetModules();
    IframeManager = (await import('./iframe-manager')).IframeManager;
  });

  describe('getInstance', () => {
    it('is a singleton', () => {
      expect(IframeManager.getInstance()).toBe(IframeManager.getInstance());
    });

    it('sets up event listener on construction', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      let manager = IframeManager.getInstance();

      expect(manager).toBeInstanceOf(IframeManager);
      expect(addEventListenerSpy).toHaveBeenCalledOnce();
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );

      manager = IframeManager.getInstance();
      expect(addEventListenerSpy).toHaveBeenCalledOnce();
    });
  });

  describe('create', () => {
    it('creates a new iframe', async () => {
      const mockWindow = {};
      vi.mocked(snapsUtils.createWindow).mockResolvedValueOnce(
        mockWindow as Window,
      );

      const manager = IframeManager.getInstance();
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

    it('creates a new iframe with a specified id', async () => {
      const mockWindow = {};
      vi.mocked(snapsUtils.createWindow).mockResolvedValueOnce(
        mockWindow as Window,
      );

      const manager = IframeManager.getInstance();
      const sendMessageSpy = vi
        .spyOn(manager, 'sendMessage')
        .mockImplementation(vi.fn());
      const id = 'foo';
      const [newWindow, returnedId] = await manager.create(id);

      expect(newWindow).toBe(mockWindow);
      expect(returnedId).toBe(id);
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

      const manager = IframeManager.getInstance();
      vi.spyOn(manager, 'sendMessage').mockImplementation(vi.fn());

      await manager.create(id);
      manager.delete(id);

      expect(removeSpy).toHaveBeenCalledOnce();
    });

    it('ignores attempt to delete unrecognized iframe', async () => {
      const id = 'foo';
      const manager = IframeManager.getInstance();
      const iframe = document.createElement('iframe');

      const removeSpy = vi.spyOn(iframe, 'remove');
      manager.delete(id);

      expect(removeSpy).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('sends a message to an iframe', async () => {
      const iframeWindow = { postMessage: vi.fn() };
      vi.mocked(snapsUtils.createWindow).mockResolvedValueOnce(
        iframeWindow as unknown as Window,
      );

      const manager = IframeManager.getInstance();
      const sendMessageSpy = vi.spyOn(manager, 'sendMessage');
      sendMessageSpy.mockImplementationOnce(async () => Promise.resolve());

      const id = 'foo';
      await manager.create(id);

      const message = { type: Command.Evaluate, data: '2+2' };

      const messagePromise = manager.sendMessage(id, message);
      const messageId: string | undefined =
        iframeWindow.postMessage.mock.lastCall?.[0]?.id;
      expect(messageId).toBeTypeOf('string');

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            id: messageId,
            message: {
              type: Command.Evaluate,
              data: '4',
            },
          },
        }),
      );

      expect(iframeWindow.postMessage).toHaveBeenCalledOnce();
      expect(iframeWindow.postMessage).toHaveBeenCalledWith(
        { id: messageId, message },
        '*',
      );
      expect(await messagePromise).toBe('4');
    });

    it('throws if iframe not found', async () => {
      const manager = IframeManager.getInstance();
      const id = 'foo';
      const message = { type: Command.Ping, data: null };

      await expect(manager.sendMessage(id, message)).rejects.toThrow(
        `No iframe with id "${id}"`,
      );
    });
  });

  describe('warnings', () => {
    it('calls console.warn when receiving unexpected message', () => {
      // Initialize manager
      IframeManager.getInstance();
      const warnSpy = vi.spyOn(console, 'warn');

      window.dispatchEvent(
        new MessageEvent('message', {
          data: 'foo',
        }),
      );

      expect(warnSpy).toHaveBeenCalledWith(
        'Offscreen received message with unexpected format',
        'foo',
      );
    });
  });
});
