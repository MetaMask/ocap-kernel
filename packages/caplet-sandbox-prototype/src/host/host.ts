import type { ColorWidgetState, MainCapletState } from '../types.ts';
import { CapletManager } from './caplet-manager.ts';

/**
 * Host application that manages multiple caplets and widgets.
 */

const stateDisplay = document.getElementById('state-display');
const iframeMount = document.getElementById('iframe-mount');

if (!stateDisplay || !iframeMount) {
  throw new Error('Required DOM elements not found');
}

const manager = new CapletManager();

// Register main caplet backend
manager.registerCaplet<MainCapletState>('main-caplet', {
  state: {
    items: ['First item', 'Second item'],
    counter: 0,
  },
  methods: {
    addItem: (state, item) => ({
      ...state,
      items: [...state.items, item as string],
    }),
    removeItem: (state, index) => {
      const newItems = [...state.items];
      newItems.splice(index as number, 1);
      return { ...state, items: newItems };
    },
    increment: (state) => ({
      ...state,
      counter: state.counter + 1,
    }),
    decrement: (state) => ({
      ...state,
      counter: state.counter - 1,
    }),
  },
});

// Register color widget backend
manager.registerCaplet<ColorWidgetState>('color-widget', {
  state: {
    color: '#3366cc',
  },
  methods: {
    setColor: (state, color) => ({
      ...state,
      color: color as string,
    }),
  },
});

/**
 * Updates the state display in the host UI.
 */
function updateStateDisplay(): void {
  const mainState = manager.getState<MainCapletState>('main-caplet');
  const widgetState = manager.getState<ColorWidgetState>('color-widget');

  if (stateDisplay) {
    stateDisplay.textContent = JSON.stringify(
      {
        'main-caplet': mainState,
        'color-widget': widgetState,
      },
      null,
      2,
    );
  }
}

// Create main caplet iframe
manager.createIframe(iframeMount, 'main-caplet', '/caplet/index.html');

// Update state display initially and periodically
updateStateDisplay();
setInterval(updateStateDisplay, 500);

manager.waitForReady('main-caplet').catch(() => undefined);
