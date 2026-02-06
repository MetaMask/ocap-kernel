import type { VatId } from '@metamask/ocap-kernel';
import type { EvaluateResult } from '@metamask/ocap-kernel/rpc';
import { useCallback } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';

/**
 * Hook for evaluating code in a vat's REPL compartment.
 *
 * @returns An object containing the evaluateVat function.
 */
export function useEvaluate(): {
  evaluateVat: (id: VatId, code: string) => Promise<EvaluateResult>;
} {
  const { callKernelMethod } = usePanelContext();

  const evaluateVat = useCallback(
    async (id: VatId, code: string): Promise<EvaluateResult> => {
      return callKernelMethod({
        method: 'evaluateVat',
        params: { id, code },
      });
    },
    [callKernelMethod],
  );

  return { evaluateVat };
}
