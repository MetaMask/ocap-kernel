import { useEffect, useRef } from 'react';

import styles from '../App.module.css';
import { usePanelContext } from '../context/PanelContext.tsx';
import type { OutputType } from '../context/PanelContext.tsx';
import { LoadingDots } from './shared/LoadingDots.tsx';

const getLogTypeIcon = (type: OutputType): string => {
  switch (type) {
    case 'received':
      return '←';
    case 'error':
      return '⚠';
    case 'success':
      return '✓';
    case 'sent':
    default:
      return '→';
  }
};

/**
 * @returns A panel for sending messages to the kernel.
 */
export const MessagePanel: React.FC = () => {
  const { panelLogs, clearLogs, isLoading } = usePanelContext();
  const messageScrollRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom of the message output when the panel logs change
  useEffect(() => {
    if (messageScrollRef.current) {
      messageScrollRef.current.scrollTop =
        messageScrollRef.current.scrollHeight;
    }
  }, [panelLogs]);

  return (
    <div className={styles.outputSection}>
      <div className={styles.outputHeader}>
        <h4>Message History</h4>
        <button
          className={styles.smallButton}
          data-testid="clear-logs-button"
          onClick={clearLogs}
        >
          Clear
        </button>
      </div>
      <div className={styles.messageOutput} ref={messageScrollRef} role="log">
        <div data-testid="message-output">
          {panelLogs.map((log, index) => (
            <div key={index} className={styles[log.type]}>
              <span className={styles.logType}>{getLogTypeIcon(log.type)}</span>
              <span className={styles.logMessage}>{log.message}</span>
            </div>
          ))}
          {isLoading && <LoadingDots />}
        </div>
      </div>
    </div>
  );
};
