import { useKernelActions } from '../hooks/useKernelActions.js';

/**
 * @returns A panel for controlling the kernel.
 */
export const KernelControls: React.FC = () => {
  const { terminateAllVats, clearState } = useKernelActions();

  return (
    <div className="kernel-controls">
      <button className="blue" onClick={terminateAllVats}>
        Terminate All Vats
      </button>
      <button className="red" onClick={clearState}>
        Clear All State
      </button>
    </div>
  );
};
