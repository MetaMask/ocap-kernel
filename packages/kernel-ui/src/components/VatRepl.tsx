import {
  Button,
  ButtonVariant,
  ButtonSize,
  Box,
  Text as TextComponent,
  TextVariant,
  TextColor,
  FontWeight,
} from '@metamask/design-system-react';
import type { EvaluateResult } from '@metamask/ocap-kernel/rpc';
import { useState, useCallback } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';
import { useEvaluate } from '../hooks/useEvaluate.ts';

/**
 * @returns The VatRepl component.
 */
export const VatRepl: React.FC = () => {
  const { status, logMessage } = usePanelContext();
  const { evaluateVat } = useEvaluate();
  const [selectedVat, setSelectedVat] = useState<string>('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<EvaluateResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const vats = status?.vats ?? [];

  const onEvaluate = useCallback(() => {
    if (!selectedVat || !code.trim()) {
      return;
    }
    setIsEvaluating(true);
    setResult(null);
    evaluateVat(selectedVat, code)
      .then((evalResult: EvaluateResult) => {
        setResult(evalResult);
        if (evalResult.success) {
          return logMessage(
            `Evaluated in ${selectedVat}: ${JSON.stringify(evalResult.value)}`,
            'success',
          );
        }
        return logMessage(
          `Evaluation error in ${selectedVat}: ${evalResult.error}`,
          'error',
        );
      })
      .catch((error: Error) => {
        logMessage(`Failed to evaluate: ${error.message}`, 'error');
      })
      .finally(() => {
        setIsEvaluating(false);
      });
  }, [selectedVat, code, evaluateVat, logMessage]);

  return (
    <Box>
      <Box className="mb-6">
        <Box className="flex flex-col md:flex-row gap-6">
          <Box className="flex flex-col gap-3">
            <TextComponent
              variant={TextVariant.BodySm}
              fontWeight={FontWeight.Medium}
              color={TextColor.TextDefault}
            >
              Select Vat
            </TextComponent>
            <select
              className="flex items-center h-9 px-3 rounded border border-border-default text-sm bg-background-default text-text-default cursor-pointer transition-colors hover:bg-background-hover focus:outline-none focus:ring-2 focus:ring-primary-default"
              value={selectedVat}
              onChange={(event) => setSelectedVat(event.target.value)}
              data-testid="vat-selector"
            >
              <option value="" disabled>
                Select a vat
              </option>
              {vats.map((vat) => (
                <option key={vat.id} value={vat.id}>
                  {vat.id}
                </option>
              ))}
            </select>
          </Box>
        </Box>
      </Box>

      <Box className="flex flex-col gap-3 mb-6">
        <TextComponent
          variant={TextVariant.BodySm}
          fontWeight={FontWeight.Medium}
          color={TextColor.TextDefault}
        >
          Code
        </TextComponent>
        <textarea
          className="w-full h-32 px-3 py-2 rounded border border-border-default text-sm bg-background-default text-text-default font-mono transition-colors hover:bg-background-hover focus:outline-none focus:ring-2 focus:ring-primary-default resize-vertical"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Enter code to evaluate..."
          data-testid="code-input"
        />
        <Box>
          <Button
            variant={ButtonVariant.Primary}
            size={ButtonSize.Md}
            onClick={onEvaluate}
            isDisabled={!selectedVat || !code.trim() || isEvaluating}
            className="rounded-md h-9"
            data-testid="evaluate-button"
          >
            <TextComponent
              variant={TextVariant.BodySm}
              fontWeight={FontWeight.Medium}
              color={TextColor.PrimaryInverse}
              className="select-none"
            >
              {isEvaluating ? 'Evaluating...' : 'Evaluate'}
            </TextComponent>
          </Button>
        </Box>
      </Box>

      {result && (
        <Box className="flex flex-col gap-3">
          <TextComponent
            variant={TextVariant.BodySm}
            fontWeight={FontWeight.Medium}
            color={TextColor.TextDefault}
          >
            Result
          </TextComponent>
          <pre
            className={`px-3 py-2 rounded border text-sm font-mono whitespace-pre-wrap break-all ${
              result.success
                ? 'border-success-default bg-success-muted text-success-default'
                : 'border-error-default bg-error-muted text-error-default'
            }`}
            data-testid="result-display"
          >
            {result.success
              ? JSON.stringify(result.value, null, 2)
              : result.error}
          </pre>
        </Box>
      )}
    </Box>
  );
};
