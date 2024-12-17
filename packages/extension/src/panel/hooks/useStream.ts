import { useState, useEffect } from 'react';

import { setupStream } from '../services/stream.js';
import type { SendMessageFunction } from '../services/stream.js';

export type StreamState = {
  sendMessage?: SendMessageFunction;
  error?: Error;
};

/**
 * Hook to setup the stream and provide a sendMessage function.
 *
 * @returns The stream state.
 */
export function useStream(): StreamState {
  const [state, setState] = useState<StreamState>({});

  /**
   * Effect to setup the stream and provide a sendMessage function.
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
