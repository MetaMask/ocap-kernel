import {
  Box,
  TextButton,
  TextButtonSize,
  Text as TextComponent,
  TextVariant,
} from '@metamask/design-system-react';
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

const getLogTypeStyles = (type: OutputType): string => {
  switch (type) {
    case 'sent':
      return 'text-text-muted';
    case 'received':
      return 'text-text-default mb-2';
    case 'error':
      return 'text-error-default mb-2';
    case 'success':
      return 'text-success-default mb-2';
    default:
      return 'text-text-default';
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
    const scrollToBottom = (): void => {
      if (messageScrollRef.current) {
        messageScrollRef.current.scrollTop =
          messageScrollRef.current.scrollHeight;
      }
    };

    // Scroll immediately
    scrollToBottom();

    // Also scroll after a small delay to ensure DOM is updated
    const timeoutId = setTimeout(scrollToBottom, 0);

    return () => clearTimeout(timeoutId);
  }, [panelLogs]);

  return (
    <Box className="h-full flex flex-col rounded-md overflow-hidden">
      <Box className="p-3 border-b border-muted flex justify-between items-center h-10">
        <TextComponent variant={TextVariant.BodySm}>
          Message History
        </TextComponent>
        {panelLogs.length > 0 && (
          <TextButton
            size={TextButtonSize.BodyXs}
            data-testid="clear-logs-button"
            onClick={clearLogs}
            className="min-w-0"
          >
            Clear
          </TextButton>
        )}
      </Box>
      <div
        className="flex-1 font-mono text-xs leading-relaxed p-3 rounded-none text-text-default overflow-y-auto"
        style={{
          boxShadow: 'inset 0 0 10px 0 var(--color-shadow-default)',
        }}
        ref={messageScrollRef}
        role="log"
      >
        <Box data-testid="message-output">
          {panelLogs.map((log, index) => (
            <Box key={index} className={`${getLogTypeStyles(log.type)}`}>
              <span className="inline-block text-center mr-1">
                {getLogTypeIcon(log.type)}
              </span>
              <span className="whitespace-pre-wrap">{log.message}</span>
            </Box>
          ))}
          {isLoading && <LoadingDots />}
        </Box>
      </div>
    </Box>
  );
};
