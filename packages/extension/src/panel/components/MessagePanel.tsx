import { KernelCommandMethod } from '@ocap/kernel';
import type { KernelCommand } from '@ocap/kernel';
import { useEffect, useRef } from 'react';

import styles from '../App.module.css';
import { usePanelContext } from '../context/PanelContext.js';
import { useKernelActions } from '../hooks/useKernelActions.js';

const commonMessages: Record<string, KernelCommand> = {
  KVSet: {
    method: KernelCommandMethod.kvSet,
    params: { key: 'foo', value: 'bar' },
  },
  KVGet: { method: KernelCommandMethod.kvGet, params: 'foo' },
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
      <h4 className={styles.outputHeader}>Output Log</h4>
      <div className={styles.messageOutput} ref={messageOutputRef}>
        {panelLogs.map((log) => (
          <div key={log.message} className={styles[log.type]}>
            {log.message}
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
