import { useState } from 'preact/hooks';

import { useBackendMethods, useBackendState } from '../caplet/sdk.tsx';
import { Slot } from '../caplet/Slot.tsx';
import type { MainCapletState } from '../types.ts';

const styles = {
  container: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  section: {
    marginBottom: '24px',
    padding: '16px',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600' as const,
    color: '#666',
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
  },
  counterDisplay: {
    fontSize: '48px',
    fontWeight: 'bold' as const,
    textAlign: 'center' as const,
    marginBottom: '16px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
  },
  button: {
    padding: '8px 16px',
    fontSize: '16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    background: '#0066cc',
    color: 'white',
  },
  dangerButton: {
    padding: '4px 8px',
    fontSize: '12px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    background: '#cc3333',
    color: 'white',
  },
  inputGroup: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #ccc',
    borderRadius: '4px',
  },
  list: {
    listStyle: 'none',
    padding: 0,
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#f8f8f8',
    marginBottom: '4px',
    borderRadius: '4px',
  },
  slotContainer: {
    border: '2px dashed #ccc',
    borderRadius: '8px',
    padding: '8px',
    minHeight: '150px',
  },
};

/**
 * Fires and forgets an async function, suppressing any errors.
 *
 * @param fn - The async function to call.
 */
function fireAndForget(fn: () => Promise<unknown>): void {
  fn().catch(() => undefined);
}

/**
 * Creates an onClick handler that fires and forgets an async operation.
 *
 * @param fn - The async function to call.
 * @returns A void-returning click handler.
 */
function onClickAsync(fn: () => Promise<unknown>): () => void {
  return () => fireAndForget(fn);
}

/**
 * Main caplet UI demonstrating the SDK hooks and Slot component.
 *
 * @returns Preact component.
 */
export function App(): preact.JSX.Element {
  const backend = useBackendMethods([
    'addItem',
    'removeItem',
    'increment',
    'decrement',
  ]);
  const counter = useBackendState<MainCapletState, number>(
    (state) => state.counter,
  );
  const items = useBackendState<MainCapletState, string[]>(
    (state) => state.items,
  );
  const [newItem, setNewItem] = useState('');

  const handleAddItem = (): void => {
    if (newItem.trim()) {
      fireAndForget(async () => backend.addItem(newItem.trim()));
      setNewItem('');
    }
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      handleAddItem();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Counter</div>
        <div style={styles.counterDisplay}>{counter ?? '...'}</div>
        <div style={styles.buttonGroup}>
          <button
            style={styles.button}
            onClick={onClickAsync(async () => backend.decrement())}
          >
            − Decrement
          </button>
          <button
            style={styles.button}
            onClick={onClickAsync(async () => backend.increment())}
          >
            + Increment
          </button>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Items List</div>
        <div style={styles.inputGroup}>
          <input
            type="text"
            value={newItem}
            onInput={(event) =>
              setNewItem((event.target as HTMLInputElement).value)
            }
            onKeyDown={handleKeyDown}
            placeholder="Enter new item..."
            style={styles.input}
          />
          <button style={styles.button} onClick={() => handleAddItem()}>
            Add
          </button>
        </div>
        <ul style={styles.list}>
          {items?.map((item, index) => (
            <li key={index} style={styles.listItem}>
              <span>{item}</span>
              <button
                style={styles.dangerButton}
                onClick={onClickAsync(async () => backend.removeItem(index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Embedded Widget (Slot)</div>
        <div style={styles.slotContainer}>
          <Slot
            widgetId="color-widget"
            widgetUrl="/example-widget/index.html"
            style={{ height: '150px' }}
          />
        </div>
      </div>
    </div>
  );
}
