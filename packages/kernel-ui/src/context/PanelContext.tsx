import { stringify } from '@metamask/kernel-utils';
import type { KernelStatus } from '@metamask/ocap-kernel';
import { isJsonRpcFailure } from '@metamask/utils';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useRef,
} from 'react';
import type { ReactNode } from 'react';

import { useStatusPolling } from '../hooks/useStatusPolling.ts';
import { logger } from '../services/logger.ts';
import type { CallKernelMethod } from '../services/stream.ts';
import type { ObjectRegistry } from '../types.ts';

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
  objectRegistry: ObjectRegistry | null;
  setObjectRegistry: (objectRegistry: ObjectRegistry | null) => void;
};

const PanelContext = createContext<PanelContextType | undefined>(undefined);

export const PanelProvider: React.FC<{
  children: ReactNode;
  callKernelMethod: CallKernelMethod;
}> = ({ children, callKernelMethod }) => {
  const isRequestInProgress = useRef(false);
  const pendingRequests = useRef<
    {
      payload: Parameters<CallKernelMethod>[0];
      resolve: (value: Awaited<ReturnType<CallKernelMethod>>) => void;
      reject: (reason: unknown) => void;
    }[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [panelLogs, setPanelLogs] = useState<PanelLog[]>([]);
  const [messageContent, setMessageContent] = useState<string>('');
  const [objectRegistry, setObjectRegistry] = useState<ObjectRegistry | null>(
    null,
  );

  const logMessage = useCallback(
    (message: string, type: OutputType = 'received'): void => {
      setPanelLogs((prevLogs) => [...prevLogs, { message, type }]);
    },
    [],
  );

  const clearLogs = useCallback(() => {
    setPanelLogs([]);
  }, []);

  const processRequests = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    while (pendingRequests.current.length > 0) {
      const request = pendingRequests.current.shift();
      if (!request) {
        break;
      }
      const { payload, resolve, reject } = request;
      try {
        logMessage(stringify(payload), 'sent');
        const response = await callKernelMethod(payload);
        if (isJsonRpcFailure(response)) {
          throw new Error(stringify((response as { error: unknown }).error, 0));
        }
        resolve(response);
      } catch (error) {
        logger.error(String(error), 'error');
        reject(error);
      }
    }
    isRequestInProgress.current = false;
    setIsLoading(false);
  }, [callKernelMethod, logMessage]);

  const sendMessageWrapper: CallKernelMethod = useCallback(
    async (payload) => {
      return new Promise((resolve, reject) => {
        pendingRequests.current.push({ payload, resolve, reject });
        if (!isRequestInProgress.current) {
          isRequestInProgress.current = true;
          processRequests().catch((error) => {
            // This should never happen as processRequests handles errors internally
            // but if it does, log it and reset the state
            logger.error('Unexpected error in processRequests', error);
            isRequestInProgress.current = false;
            setIsLoading(false);
          });
        }
      });
    },
    [processRequests],
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
        objectRegistry,
        setObjectRegistry,
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
