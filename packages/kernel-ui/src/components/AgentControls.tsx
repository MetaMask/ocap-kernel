import styles from '../App.module.css';

/**
 * @returns A panel for controlling agents.
 */
export const AgentControls: React.FC = () => {
  // const { startAgent, stopAgent } = useAgentActions();

  return (
    <div className={styles.headerControls}>
      Agent controls placeholder.
      {/*
      {hasVats && (
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
      */}
    </div>
  );
};
