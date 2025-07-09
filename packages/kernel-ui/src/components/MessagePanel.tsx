import { TextButton, TextButtonSize } from '@metamask/design-system-react';
import { useEffect, useRef } from 'react';

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
    <div className="outputSection">
      <div className="outputHeader">
        <h4>Message History</h4>
        <TextButton
          size={TextButtonSize.BodyXs}
          data-testid="clear-logs-button"
          onClick={clearLogs}
          className="min-w-0"
        >
          Clear
        </TextButton>
      </div>
      <div className="messageOutput" ref={messageScrollRef} role="log">
        <div data-testid="message-output">
          {panelLogs.map((log, index) => (
            <div key={index} className={log.type}>
              <span className="logType">{getLogTypeIcon(log.type)}</span>
              <span className="logMessage">{log.message}</span>
            </div>
          ))}
          {isLoading && <LoadingDots />}
        </div>
      </div>
    </div>
  );
};
