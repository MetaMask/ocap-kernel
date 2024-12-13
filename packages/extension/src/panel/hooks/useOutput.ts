import { useState } from 'react';

export type OutputType = 'info' | 'success' | 'error';

/**
 * Hook to manage the output message and type.
 *
 * @returns An object containing the output message, type, and a function to show an output message.
 */
export const useOutput = (): {
  messageContent: string;
  setMessageContent: (content: string) => void;
  outputMessage: string;
  outputType: OutputType;
  showOutput: (message: string, type?: OutputType) => void;
} => {
  const [outputMessage, setOutputMessage] = useState<string>('');
  const [outputType, setOutputType] = useState<OutputType>('info');
  const [messageContent, setMessageContent] = useState<string>('');

  const showOutput = (message: string, type: OutputType = 'info'): void => {
    setOutputMessage(message);
    setOutputType(type);
  };

  return {
    messageContent,
    setMessageContent,
    outputMessage,
    outputType,
    showOutput,
  };
};
