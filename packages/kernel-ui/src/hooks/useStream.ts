import { useState, useEffect } from 'react';

import { setupStream } from '../services/stream.ts';
import type { CallKernelMethod } from '../services/stream.ts';

export type StreamState = {
  callKernelMethod?: CallKernelMethod;
  error?: Error;
};

/**
 * Hook to setup the stream and provide a callKernelMethod function.
 *
 * @returns The stream state.
 */
export function useStream(): StreamState {
  const [state, setState] = useState<StreamState>({});

  /**
   * Effect to setup the stream and provide a callKernelMethod function.
   */
  useEffect(() => {
    setupStream()
      .then(setState)
      .catch((error: Error) => {
        setState({ error });
      });
  }, []);

  return state;
}
