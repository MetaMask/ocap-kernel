import { useEffect, useRef } from 'react';

import styles from '../App.module.css';
import { usePanelContext } from '../context/PanelContext.tsx';
import type { OutputType } from '../context/PanelContext.tsx';
import { useKernelActions } from '../hooks/useKernelActions.ts';

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
  const { messageContent, setMessageContent, panelLogs, clearLogs } =
    usePanelContext();
  const { sendKernelCommand } = useKernelActions();
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
        <button className={styles.smallButton} onClick={clearLogs}>
          Clear
        </button>
      </div>
      <div className={styles.messageOutput}>
        <div
          className={styles.messageScrollWrapper}
          ref={messageScrollRef}
          role="log"
        >
          {panelLogs.map((log, index) => (
            <div key={index} className={styles[log.type]}>
              <span className={styles.logType}>{getLogTypeIcon(log.type)}</span>
              <span className={styles.logMessage}>{log.message}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.messageInputSection}>
        <div className={styles.messageInputRow}>
          <input
            className={styles.messageContent}
            type="text"
            value={messageContent}
            onChange={(event) => setMessageContent(event.target.value)}
            placeholder="Enter message (as JSON)"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && messageContent.trim()) {
                sendKernelCommand();
              }
            }}
          />
          <button
            className={styles.sendButton}
            onClick={sendKernelCommand}
            disabled={!messageContent.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
