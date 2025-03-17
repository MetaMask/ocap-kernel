import { stringify } from '@ocap/utils';
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

import type { KernelStatus } from '../../kernel-integration/messages.ts';
import { useStatusPolling } from '../hooks/useStatusPolling.ts';
import { logger } from '../services/logger.ts';
import type { SendMessageFunction } from '../services/stream.ts';
import { isErrorResponse } from '../utils.ts';

export type OutputType = 'sent' | 'received' | 'error' | 'success';

type PanelLog = {
  message: string;
  type: OutputType;
};

export type PanelContextType = {
  sendMessage: SendMessageFunction;
  status: KernelStatus | undefined;
  logMessage: (message: string, type?: OutputType) => void;
  messageContent: string;
  setMessageContent: (content: string) => void;
  panelLogs: PanelLog[];
  clearLogs: () => void;
};

const PanelContext = createContext<PanelContextType | undefined>(undefined);

export const PanelProvider: React.FC<{
  children: ReactNode;
  sendMessage: SendMessageFunction;
}> = ({ children, sendMessage }) => {
  const [panelLogs, setPanelLogs] = useState<PanelLog[]>([]);
  const [messageContent, setMessageContent] = useState<string>('');

  const logMessage = useCallback(
    (message: string, type: OutputType = 'received'): void => {
      setPanelLogs((prevLogs) => [...prevLogs, { message, type }]);
    },
    [],
  );

  const clearLogs = useCallback(() => {
    setPanelLogs([]);
  }, []);

  const sendMessageWrapper: SendMessageFunction = useCallback(
    async (payload) => {
      try {
        logMessage(stringify(payload, 2), 'sent');
        const response = await sendMessage(payload);
        if (isErrorResponse(response)) {
          throw new Error(stringify(response.error, 0));
        }
        return response;
      } catch (error) {
        logger.error(String(error), 'error');
        throw error;
      }
    },
    [sendMessage],
  );

  const status = useStatusPolling(sendMessage, 1000);

  return (
    <PanelContext.Provider
      value={{
        sendMessage: sendMessageWrapper,
        status,
        logMessage,
        messageContent,
        setMessageContent,
        panelLogs,
        clearLogs,
      }}
    >
      {children}
    </PanelContext.Provider>
  );
};

export const usePanelContext = (): PanelContextType => {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanelContext must be used within a PanelProvider');
  }
  return context;
};
