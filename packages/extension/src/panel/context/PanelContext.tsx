import type { VatId } from '@ocap/kernel';
import { stringify } from '@ocap/utils';
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

import type { KernelStatus } from '../../kernel-integration/messages.js';
import { useStatusPolling } from '../hooks/useStatusPolling.js';
import { logger } from '../services/logger.js';
import type { SendMessageFunction } from '../services/stream.js';
import { isErrorResponse } from '../utils.js';

export type OutputType = 'sent' | 'received' | 'error' | 'success';

type PanelLog = {
  message: string;
  type: OutputType;
};

type PanelContextType = {
  sendMessage: SendMessageFunction;
  status: KernelStatus | null;
  logMessage: (message: string, type?: OutputType) => void;
  setStatus: (status: KernelStatus) => void;
  messageContent: string;
  setMessageContent: (content: string) => void;
  panelLogs: PanelLog[];
  selectedVatId: VatId | undefined;
  setSelectedVatId: (id: VatId | undefined) => void;
};

const PanelContext = createContext<PanelContextType | undefined>(undefined);

export const PanelProvider: React.FC<{
  children: ReactNode;
  sendMessage: SendMessageFunction;
}> = ({ children, sendMessage }) => {
  const [panelLogs, setPanelLogs] = useState<PanelLog[]>([]);
  const [messageContent, setMessageContent] = useState<string>('');
  const [selectedVatId, setSelectedVatId] = useState<VatId | undefined>();
  const [status, setStatus] = useState<KernelStatus | null>(null);

  const logMessage = (message: string, type: OutputType = 'received'): void => {
    setPanelLogs((prevLogs) => [...prevLogs, { message, type }]);
  };

  const sendMessageWrapper: SendMessageFunction = async (payload) => {
    try {
      logMessage(stringify(payload, 0), 'sent');
      const response = await sendMessage(payload);
      if (isErrorResponse(response)) {
        throw new Error(stringify(response.error, 0));
      }
      return response;
    } catch (error) {
      logger.error(`Error: ${String(error)}`, 'error');
      throw error;
    }
  };

  useStatusPolling(setStatus, sendMessage, 1000);

  return (
    <PanelContext.Provider
      value={{
        sendMessage: sendMessageWrapper,
        status,
        setStatus,
        logMessage,
        messageContent,
        setMessageContent,
        panelLogs,
        selectedVatId,
        setSelectedVatId,
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
