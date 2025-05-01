import { stringify } from '@metamask/kernel-utils';
import { isJsonRpcFailure } from '@metamask/utils';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useRef,
} from 'react';
import type { ReactNode } from 'react';

import type { KernelStatus } from '../../kernel-integration/handlers/index.ts';
import { useStatusPolling } from '../hooks/useStatusPolling.ts';
import { logger } from '../services/logger.ts';
import type { CallKernelMethod } from '../services/stream.ts';

export type OutputType = 'sent' | 'received' | 'error' | 'success';

type PanelLog = {
  message: string;
  type: OutputType;
};

export type PanelContextType = {
  callKernelMethod: CallKernelMethod;
  status: KernelStatus | undefined;
  logMessage: (message: string, type?: OutputType) => void;
  messageContent: string;
  setMessageContent: (content: string) => void;
  panelLogs: PanelLog[];
  clearLogs: () => void;
  isLoading: boolean;
};

const PanelContext = createContext<PanelContextType | undefined>(undefined);

export const PanelProvider: React.FC<{
  children: ReactNode;
  callKernelMethod: CallKernelMethod;
}> = ({ children, callKernelMethod }) => {
  const [panelLogs, setPanelLogs] = useState<PanelLog[]>([]);
  const [messageContent, setMessageContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const isRequestInProgress = useRef(false);

  const logMessage = useCallback(
    (message: string, type: OutputType = 'received'): void => {
      setPanelLogs((prevLogs) => [...prevLogs, { message, type }]);
    },
    [],
  );

  const clearLogs = useCallback(() => {
    setPanelLogs([]);
  }, []);

  const sendMessageWrapper: CallKernelMethod = useCallback(
    async (payload) => {
      if (isRequestInProgress.current) {
        throw new Error('A request is already in progress');
      }

      const cleanup = (): void => {
        isRequestInProgress.current = false;
        setIsLoading(false);
      };

      try {
        isRequestInProgress.current = true;
        setIsLoading(true);
        logMessage(stringify(payload, 2), 'sent');

        const response = await callKernelMethod(payload);
        if (isJsonRpcFailure(response)) {
          throw new Error(stringify(response.error, 0));
        }
        return response;
      } catch (error) {
        logger.error(String(error), 'error');
        throw error;
      } finally {
        cleanup();
      }
    },
    [callKernelMethod],
  );

  const status = useStatusPolling(callKernelMethod, isRequestInProgress);

  return (
    <PanelContext.Provider
      value={{
        callKernelMethod: sendMessageWrapper,
        status,
        logMessage,
        messageContent,
        setMessageContent,
        panelLogs,
        clearLogs,
        isLoading,
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
