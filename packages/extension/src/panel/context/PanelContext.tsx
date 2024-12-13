import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import type {
  KernelControlCommand,
  KernelStatus,
} from '../../kernel-integration/messages.js';
import { useMessageHandler } from '../hooks/useMessageHandler.js';
import { useOutput } from '../hooks/useOutput.js';
import type { OutputType } from '../hooks/useOutput.js';
import { useStatusPolling } from '../hooks/useStatusPolling.js';
import { setupStream } from '../services/stream.js';

type PanelContextType = {
  sendMessage: (message: KernelControlCommand) => Promise<void>;
  status: KernelStatus | null;
  showOutput: (message: string, type?: OutputType) => void;
  setStatus: (status: KernelStatus) => void;
  messageContent: string;
  setMessageContent: (content: string) => void;
  outputMessage: string;
  outputType: string;
};

const PanelContext = createContext<PanelContextType | undefined>(undefined);

export const PanelProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const {
    messageContent,
    setMessageContent,
    outputMessage,
    outputType,
    showOutput,
  } = useOutput();

  const [status, setStatus] = useState<KernelStatus | null>(null);
  const [sendMessage, setSendMessage] = useState<
    ((message: KernelControlCommand) => Promise<void>) | undefined
  >();

  const handleKernelMessage = useMessageHandler(setStatus, showOutput);

  // Initialize the stream and sendMessage
  useEffect(() => {
    setupStream(handleKernelMessage)
      .then(({ sendMessage: sendMessageFn }) =>
        setSendMessage(() => sendMessageFn),
      )
      .catch((error) => {
        showOutput(`Error: ${String(error)}`, 'error');
      });
  }, [handleKernelMessage, showOutput]);

  // Start polling when sendMessage is ready
  useStatusPolling(setStatus, sendMessage, 1000);

  const sendMessageWrapper = async (
    message: KernelControlCommand,
  ): Promise<void> => {
    if (!sendMessage) {
      return;
    }
    try {
      await sendMessage(message);
      showOutput(`Sent: ${JSON.stringify(message)}`, 'info');
    } catch (error) {
      showOutput(`Error: ${String(error)}`, 'error');
    }
  };

  return (
    <PanelContext.Provider
      value={{
        sendMessage: sendMessageWrapper,
        status,
        setStatus,
        showOutput,
        messageContent,
        setMessageContent,
        outputMessage,
        outputType,
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
