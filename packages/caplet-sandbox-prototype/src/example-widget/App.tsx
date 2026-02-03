import { useBackendMethods, useBackendState } from '../caplet/sdk.tsx';
import type { ColorWidgetState } from '../types.ts';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
  },
  title: {
    fontSize: '14px',
    fontWeight: '600' as const,
    color: '#666',
    textTransform: 'uppercase' as const,
  },
  colorPreview: {
    width: '60px',
    height: '60px',
    borderRadius: '8px',
    border: '2px solid #ccc',
  },
  colorInput: {
    width: '100px',
    height: '36px',
    padding: '4px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  colorValue: {
    fontSize: '12px',
    color: '#999',
    fontFamily: 'monospace',
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
 * Color picker widget demonstrating nested iframe communication.
 *
 * @returns Preact component.
 */
export function App(): preact.JSX.Element {
  const backend = useBackendMethods(['setColor']);
  const color = useBackendState<ColorWidgetState, string>(
    (state) => state.color,
  );

  const handleColorChange = (event: Event): void => {
    const newColor = (event.target as HTMLInputElement).value;
    fireAndForget(async () => backend.setColor(newColor));
  };

  return (
    <div style={styles.container}>
      <div style={styles.title}>Color Widget</div>
      <div style={{ ...styles.colorPreview, background: color ?? '#cccccc' }} />
      <input
        type="color"
        value={color ?? '#cccccc'}
        onChange={handleColorChange}
        style={styles.colorInput}
      />
      <div style={styles.colorValue}>{color ?? '...'}</div>
    </div>
  );
}
