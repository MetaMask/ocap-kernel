import { KernelCommandMethod } from '@ocap/kernel';
import type { KernelCommand } from '@ocap/kernel';
import { useEffect, useRef } from 'react';

import styles from '../App.module.css';
import { usePanelContext } from '../context/PanelContext.js';
import type { OutputType } from '../context/PanelContext.js';
import { useKernelActions } from '../hooks/useKernelActions.js';

const commonMessages: Record<string, KernelCommand> = {
  KVSet: {
    method: KernelCommandMethod.kvSet,
    params: { key: 'foo', value: 'bar' },
  },
  KVGet: { method: KernelCommandMethod.kvGet, params: 'foo' },
};

const getLogTypeIcon = (type: OutputType): string => {
  switch (type) {
    case 'sent':
      return '→';
    case 'received':
      return '←';
    case 'error':
      return '⚠';
    case 'success':
      return '✓';
    default:
      return '';
  }
};

/**
 * @returns A panel for sending messages to the kernel.
 */
export const MessagePanel: React.FC = () => {
  const { messageContent, setMessageContent, panelLogs } = usePanelContext();
  const { sendKernelCommand } = useKernelActions();
  const messageOutputRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom of the message output when the panel logs change
  useEffect(() => {
    if (messageOutputRef.current) {
      messageOutputRef.current.scrollTop =
        messageOutputRef.current.scrollHeight;
    }
  }, [panelLogs]);

  return (
    <div className={styles.outputSection}>
      <h4 className={styles.outputHeader}>Message History</h4>
      <div className={styles.messageOutput} ref={messageOutputRef}>
        {panelLogs.map((log, index) => (
          <div key={index} className={styles[log.type]}>
            <span className={styles.logType}>{getLogTypeIcon(log.type)}</span>
            <span className={styles.logMessage}>{log.message}</span>
          </div>
        ))}
      </div>
      <div className={styles.messageInputSection}>
        <div className={styles.messageTemplates}>
          {Object.entries(commonMessages).map(([name, template]) => (
            <button
              key={name}
              className={styles.textButton}
              onClick={() =>
                setMessageContent(JSON.stringify(template, null, 2))
              }
            >
              {name}
            </button>
          ))}
        </div>
        <div className={styles.messageInputRow}>
          <input
            className={styles.messageContent}
            type="text"
            value={messageContent}
            onChange={(event) => setMessageContent(event.target.value)}
            placeholder="Enter message (as JSON)"
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
