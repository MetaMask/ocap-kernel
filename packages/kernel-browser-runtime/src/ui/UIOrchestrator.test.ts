// @vitest-environment jsdom

import { Logger } from '@metamask/logger';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { UIOrchestrator } from './UIOrchestrator.ts';
import type { UiVatConfig } from './UIOrchestrator.ts';

// Mock initializeMessageChannel
const mockPort = {
  close: vi.fn(),
  postMessage: vi.fn(),
  onmessage: null,
  onmessageerror: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  start: vi.fn(),
  dispatchEvent: vi.fn(),
} as unknown as MessagePort;

vi.mock('@metamask/streams/browser', () => ({
  initializeMessageChannel: vi.fn(async () => mockPort),
}));

/**
 * Creates a mock container element with tracking for appended children.
 *
 * @returns A mock container element.
 */
const makeContainer = (): HTMLElement & {
  children: HTMLElement[];
  appendedChildren: HTMLElement[];
} => {
  const appendedChildren: HTMLElement[] = [];
  const children: HTMLElement[] = [];

  return {
    appendChild: vi.fn((child: HTMLElement) => {
      appendedChildren.push(child);
      children.push(child);
      return child;
    }),
    removeChild: vi.fn((child: HTMLElement) => {
      const index = children.indexOf(child);
      if (index !== -1) {
        children.splice(index, 1);
      }
      return child;
    }),
    appendedChildren,
    children,
  } as unknown as HTMLElement & {
    children: HTMLElement[];
    appendedChildren: HTMLElement[];
  };
};

/**
 * Creates a mock iframe element that simulates loading.
 *
 * @param options - Options for the mock iframe.
 * @param options.readyState - The initial readyState of the iframe document.
 * @returns A mock iframe element.
 */
const makeIframe = (
  options: { readyState?: string } = {},
): HTMLIFrameElement & {
  loadListeners: (() => void)[];
  errorListeners: ((event: Event) => void)[];
  simulateLoad: () => void;
  simulateError: (message: string) => void;
  removed: boolean;
} => {
  const { readyState = 'complete' } = options;
  const loadListeners: (() => void)[] = [];
  const errorListeners: ((event: Event) => void)[] = [];
  let removed = false;
  const sandbox = {
    value: '',
  };
  const dataset: Record<string, string> = {};
  const style: Partial<CSSStyleDeclaration> = {};

  const iframe = {
    id: '',
    className: '',
    src: '',
    title: '',
    sandbox,
    dataset,
    style,
    contentWindow: {
      postMessage: vi.fn(),
    } as unknown as Window,
    contentDocument: {
      readyState,
    },
    loadListeners,
    errorListeners,
    removed,
    addEventListener: vi.fn((event: string, listener: unknown) => {
      if (event === 'load') {
        loadListeners.push(listener as () => void);
      } else if (event === 'error') {
        errorListeners.push(listener as (event: Event) => void);
      }
    }),
    removeEventListener: vi.fn((event: string, listener: unknown) => {
      if (event === 'load') {
        const index = loadListeners.indexOf(listener as () => void);
        if (index !== -1) {
          loadListeners.splice(index, 1);
        }
      } else if (event === 'error') {
        const index = errorListeners.indexOf(
          listener as (event: Event) => void,
        );
        if (index !== -1) {
          errorListeners.splice(index, 1);
        }
      }
    }),
    remove: vi.fn(() => {
      removed = true;
    }),
    simulateLoad: () => {
      for (const listener of [...loadListeners]) {
        listener();
      }
    },
    simulateError: (message: string) => {
      const event = new ErrorEvent('error', { message });
      for (const listener of [...errorListeners]) {
        listener(event);
      }
    },
  };

  // Make removed accessible via getter
  Object.defineProperty(iframe, 'removed', {
    get: () => removed,
  });

  return iframe as unknown as HTMLIFrameElement & {
    loadListeners: (() => void)[];
    errorListeners: ((event: Event) => void)[];
    simulateLoad: () => void;
    simulateError: (message: string) => void;
    removed: boolean;
  };
};

// Save original createElement before any mocking
const originalCreateElement = document.createElement.bind(document);

describe('UIOrchestrator', () => {
  let mainSlot: ReturnType<typeof makeContainer>;
  let orchestrator: UIOrchestrator;
  let createdIframes: ReturnType<typeof makeIframe>[];

  beforeEach(() => {
    vi.clearAllMocks();
    mainSlot = makeContainer();
    createdIframes = [];

    // Mock document.createElement to return our mock iframes
    vi.spyOn(document, 'createElement').mockImplementation(
      (tagName: string) => {
        if (tagName === 'iframe') {
          const iframe = makeIframe();
          createdIframes.push(iframe);
          return iframe as unknown as HTMLElement;
        }
        return originalCreateElement(tagName);
      },
    );

    orchestrator = UIOrchestrator.make({
      slots: { main: mainSlot },
      logger: new Logger('UIOrchestrator-test'),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('make', () => {
    it('creates an orchestrator instance', () => {
      expect(orchestrator).toBeInstanceOf(UIOrchestrator);
    });

    it('creates an orchestrator without explicit logger', () => {
      const orch = UIOrchestrator.make({ slots: { main: mainSlot } });
      expect(orch).toBeInstanceOf(UIOrchestrator);
    });
  });

  describe('launch', () => {
    it('creates an iframe with correct configuration', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
        title: 'Test UI',
      };

      const launchPromise = orchestrator.launch(config);

      // Simulate the iframe loading
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();

      await launchPromise;

      const iframe = createdIframes[0];
      expect(iframe).toBeDefined();
      expect(iframe?.id).toBe('ui-vat-test-ui-vat');
      expect(iframe?.className).toBe('ui-vat-iframe');
      expect(iframe?.dataset.uiVatId).toBe('test-ui-vat');
      expect(iframe?.dataset.testid).toBe('ui-vat-iframe-test-ui-vat');
      expect(iframe?.title).toBe('Test UI');
      expect(iframe?.sandbox.value).toBe('allow-scripts allow-same-origin');
      expect(iframe?.src).toContain('uiVatId=test-ui-vat');
    });

    it('appends iframe to slot', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      expect(mainSlot.appendChild).toHaveBeenCalledWith(createdIframes[0]);
    });

    it('returns MessagePort for communication', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();

      const port = await launchPromise;
      expect(port).toBe(mockPort);
    });

    it('throws if UI vat with same ID already exists', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      await expect(orchestrator.launch(config)).rejects.toThrow(
        'UI vat "test-ui-vat" already exists',
      );
    });

    it('sets default title when not provided', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      expect(createdIframes[0]?.title).toBe('UI Vat: test-ui-vat');
    });

    it('cleans up and allows retry after iframe load error', async () => {
      // Use a loading iframe that won't short-circuit #waitForIframeLoad
      vi.spyOn(document, 'createElement').mockImplementation(
        (tagName: string) => {
          if (tagName === 'iframe') {
            const iframe = makeIframe({ readyState: 'loading' });
            createdIframes.push(iframe);
            return iframe as unknown as HTMLElement;
          }
          return originalCreateElement(tagName);
        },
      );

      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateError('Network error');

      await expect(launchPromise).rejects.toThrow(
        'Failed to load iframe: Network error',
      );
      expect(createdIframes[0]?.removed).toBe(true);
      expect(orchestrator.has('test-ui-vat')).toBe(false);

      // Should be able to retry after failure
      const retryPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[1]?.simulateLoad();
      const retryPort = await retryPromise;
      expect(retryPort).toBeDefined();
    });

    it('prevents concurrent launch attempts for same ID', async () => {
      // Use a loading iframe so launch stays pending
      vi.spyOn(document, 'createElement').mockImplementation(
        (tagName: string) => {
          if (tagName === 'iframe') {
            const iframe = makeIframe({ readyState: 'loading' });
            createdIframes.push(iframe);
            return iframe as unknown as HTMLElement;
          }
          return originalCreateElement(tagName);
        },
      );

      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const firstLaunch = orchestrator.launch(config);

      // Second launch with same ID while first is in progress
      await expect(orchestrator.launch(config)).rejects.toThrow(
        'UI vat "test-ui-vat" already exists',
      );

      // Complete first launch
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await firstLaunch;
    });

    it('creates hidden iframe when visible is false', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
        visible: false,
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      expect(createdIframes[0]?.style.display).toBe('none');
    });
  });

  describe('terminate', () => {
    it('removes iframe from DOM', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      orchestrator.terminate('test-ui-vat');

      expect(createdIframes[0]?.remove).toHaveBeenCalled();
    });

    it('closes MessagePort', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      orchestrator.terminate('test-ui-vat');

      expect(mockPort.close).toHaveBeenCalled();
    });

    it('removes UI vat from tracking', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      expect(orchestrator.has('test-ui-vat')).toBe(true);

      orchestrator.terminate('test-ui-vat');

      expect(orchestrator.has('test-ui-vat')).toBe(false);
    });

    it('throws if UI vat does not exist', () => {
      expect(() => orchestrator.terminate('nonexistent')).toThrow(
        'UI vat "nonexistent" not found',
      );
    });
  });

  describe('terminateAll', () => {
    it('terminates all UI vats', async () => {
      const config1: UiVatConfig = {
        id: 'ui-vat-1',
        uri: 'https://example.com/ui1.html',
        slot: 'main',
      };
      const config2: UiVatConfig = {
        id: 'ui-vat-2',
        uri: 'https://example.com/ui2.html',
        slot: 'main',
      };

      const promise1 = orchestrator.launch(config1);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await promise1;

      const promise2 = orchestrator.launch(config2);
      await Promise.resolve();
      createdIframes[1]?.simulateLoad();
      await promise2;

      expect(orchestrator.getIds()).toHaveLength(2);

      orchestrator.terminateAll();

      expect(orchestrator.getIds()).toHaveLength(0);
      expect(createdIframes[0]?.remove).toHaveBeenCalled();
      expect(createdIframes[1]?.remove).toHaveBeenCalled();
    });
  });

  describe('show', () => {
    it('makes iframe visible', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
        visible: false,
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      expect(createdIframes[0]?.style.display).toBe('none');

      orchestrator.show('test-ui-vat');

      expect(createdIframes[0]?.style.display).toBe('');
    });

    it('throws if UI vat does not exist', () => {
      expect(() => orchestrator.show('nonexistent')).toThrow(
        'UI vat "nonexistent" not found',
      );
    });
  });

  describe('hide', () => {
    it('hides iframe', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      orchestrator.hide('test-ui-vat');

      expect(createdIframes[0]?.style.display).toBe('none');
    });

    it('throws if UI vat does not exist', () => {
      expect(() => orchestrator.hide('nonexistent')).toThrow(
        'UI vat "nonexistent" not found',
      );
    });
  });

  describe('has', () => {
    it('returns true if UI vat exists', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      expect(orchestrator.has('test-ui-vat')).toBe(true);
    });

    it('returns false if UI vat does not exist', () => {
      expect(orchestrator.has('nonexistent')).toBe(false);
    });
  });

  describe('getIds', () => {
    it('returns all UI vat IDs', async () => {
      const config1: UiVatConfig = {
        id: 'ui-vat-1',
        uri: 'https://example.com/ui1.html',
        slot: 'main',
      };
      const config2: UiVatConfig = {
        id: 'ui-vat-2',
        uri: 'https://example.com/ui2.html',
        slot: 'main',
      };

      const promise1 = orchestrator.launch(config1);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await promise1;

      const promise2 = orchestrator.launch(config2);
      await Promise.resolve();
      createdIframes[1]?.simulateLoad();
      await promise2;

      expect(orchestrator.getIds()).toStrictEqual(['ui-vat-1', 'ui-vat-2']);
    });

    it('returns empty array when no UI vats', () => {
      expect(orchestrator.getIds()).toStrictEqual([]);
    });
  });

  describe('getPort', () => {
    it('returns MessagePort for UI vat', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      expect(orchestrator.getPort('test-ui-vat')).toBe(mockPort);
    });

    it('throws if UI vat does not exist', () => {
      expect(() => orchestrator.getPort('nonexistent')).toThrow(
        'UI vat "nonexistent" not found',
      );
    });
  });

  describe('getIframe', () => {
    it('returns iframe element for UI vat', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      expect(orchestrator.getIframe('test-ui-vat')).toBe(createdIframes[0]);
    });

    it('throws if UI vat does not exist', () => {
      expect(() => orchestrator.getIframe('nonexistent')).toThrow(
        'UI vat "nonexistent" not found',
      );
    });
  });

  describe('getSlotNames', () => {
    it('returns all slot names', () => {
      expect(orchestrator.getSlotNames()).toStrictEqual(['main']);
    });

    it('returns multiple slot names', () => {
      const sidebarSlot = makeContainer();
      const multiSlotOrchestrator = UIOrchestrator.make({
        slots: { main: mainSlot, sidebar: sidebarSlot },
      });
      expect(multiSlotOrchestrator.getSlotNames().sort()).toStrictEqual([
        'main',
        'sidebar',
      ]);
    });
  });

  describe('getVatsInSlot', () => {
    it('returns UI vat IDs in a specific slot', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      expect(orchestrator.getVatsInSlot('main')).toStrictEqual(['test-ui-vat']);
    });

    it('returns empty array for empty slot', () => {
      expect(orchestrator.getVatsInSlot('main')).toStrictEqual([]);
    });
  });

  describe('getSlot', () => {
    it('returns slot name for UI vat', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'main',
      };

      const launchPromise = orchestrator.launch(config);
      await Promise.resolve();
      createdIframes[0]?.simulateLoad();
      await launchPromise;

      expect(orchestrator.getSlot('test-ui-vat')).toBe('main');
    });

    it('throws if UI vat does not exist', () => {
      expect(() => orchestrator.getSlot('nonexistent')).toThrow(
        'UI vat "nonexistent" not found',
      );
    });
  });

  describe('slot validation', () => {
    it('throws if slot does not exist', async () => {
      const config: UiVatConfig = {
        id: 'test-ui-vat',
        uri: 'https://example.com/ui.html',
        slot: 'nonexistent',
      };

      await expect(orchestrator.launch(config)).rejects.toThrow(
        'Slot "nonexistent" not found',
      );
    });
  });
});
