import styles from '../App.module.css';
import { useKernelActions } from '../hooks/useKernelActions.ts';
import { useVats } from '../hooks/useVats.ts';

/**
 * @returns A panel for controlling the kernel.
 */
export const KernelControls: React.FC = () => {
  const { terminateAllVats, collectGarbage, clearState, reload } =
    useKernelActions();
  const { vats } = useVats();

  return (
    <div className={styles.headerControls}>
      {vats.length > 0 && (
        <button className={styles.buttonWarning} onClick={terminateAllVats}>
          Terminate All Vats
        </button>
      )}
      <button onClick={collectGarbage} className={styles.buttonGray}>
        Collect Garbage
      </button>
      <button className={styles.buttonDanger} onClick={clearState}>
        Clear All State
      </button>
      <button className={styles.buttonBlack} onClick={reload}>
        Reload Kernel
      </button>
    </div>
  );
};
