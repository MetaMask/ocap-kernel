import {
  Button,
  ButtonVariant,
  Text as TextComponent,
  TextVariant,
  Box,
  FontWeight,
  ButtonSize,
  TextColor,
} from '@metamask/design-system-react';
import { stringify } from '@metamask/kernel-utils';
import type { Json } from '@metamask/utils';
import { useState, useMemo } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';
import { useRegistry } from '../hooks/useRegistry.ts';

/**
 * Renders a form for users to queue a message to a vat.
 *
 * @returns JSX element for queue message form
 */
export const SendMessageForm: React.FC = () => {
  const { callKernelMethod, logMessage, objectRegistry } = usePanelContext();
  const { fetchObjectRegistry } = useRegistry();
  const [target, setTarget] = useState('');
  const [method, setMethod] = useState('__getMethodNames__');
  const [paramsText, setParamsText] = useState('[]');
  const [result, setResult] = useState<Json | null>(null);

  // Build list of object KRef targets with their owner vat names
  const targets = useMemo(() => {
    if (!objectRegistry) {
      return [];
    }

    const seen = new Set<string>();
    const list: { label: string; value: string }[] = [];
    for (const [vatId, vat] of Object.entries(objectRegistry.vats)) {
      const ownerName = vat.overview.name ?? vatId;
      // Owned objects
      for (const obj of vat.ownedObjects) {
        if (!seen.has(obj.kref)) {
          seen.add(obj.kref);
          list.push({ label: `${obj.kref} (${ownerName})`, value: obj.kref });
        }
      }
      // Imported objects
      for (const obj of vat.importedObjects) {
        const originVat = obj.fromVat ?? vatId;
        const originName =
          objectRegistry.vats[originVat]?.overview.name ?? originVat;
        if (!seen.has(obj.kref)) {
          seen.add(obj.kref);
          list.push({ label: `${obj.kref} (${originName})`, value: obj.kref });
        }
      }
    }
    return list;
  }, [objectRegistry]);

  const handleSend = (): void => {
    Promise.resolve()
      .then(() => JSON.parse(paramsText) as Json[])
      .then(async (args) =>
        callKernelMethod({
          method: 'queueMessage',
          params: [target, method, args],
        }),
      )
      .then((response) => {
        setResult(response);
        logMessage(stringify(response), 'received');
        return fetchObjectRegistry();
      })
      .catch((error) => logMessage(String(error), 'error'));
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => {
    if (event.key === 'Enter') {
      handleSend();
    }
  };

  if (!objectRegistry) {
    return <></>;
  }

  return (
    <Box className="bg-section p-4 rounded mb-4">
      <TextComponent
        variant={TextVariant.BodySm}
        fontWeight={FontWeight.Medium}
        className="mb-4"
      >
        Send Message
      </TextComponent>
      <Box className="flex flex-col lg:flex-row gap-3">
        <Box className="flex flex-col flex-1 lg:flex-none lg:w-[200px]">
          <label
            htmlFor="message-target"
            className="mb-1 text-sm text-text-default"
          >
            Target:
          </label>
          <select
            id="message-target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            data-testid="message-target"
            className="flex items-center h-9 px-3 rounded border border-border-default text-sm bg-background-default text-text-default cursor-pointer transition-colors hover:bg-background-hover focus:outline-none focus:ring-2 focus:ring-primary-default"
          >
            <option value="" disabled>
              Select target
            </option>
            {targets.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Box>
        <Box className="flex flex-col flex-1">
          <label
            htmlFor="message-method"
            className="mb-1 text-sm text-text-default"
          >
            Method:
          </label>
          <input
            id="message-method"
            type="text"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            placeholder="methodName"
            onKeyDown={handleKeyDown}
            data-testid="message-method"
            className="flex items-center h-9 px-3 rounded border border-border-default text-sm bg-background-default text-text-default transition-colors hover:bg-background-hover focus:outline-none focus:ring-2 focus:ring-primary-default"
          />
        </Box>
        <Box className="flex flex-col flex-1">
          <label
            htmlFor="message-params"
            className="mb-1 text-sm text-text-default"
          >
            Params (JSON):
          </label>
          <input
            id="message-params"
            value={paramsText}
            onChange={(event) => setParamsText(event.target.value)}
            placeholder="[arg1, arg2]"
            onKeyDown={handleKeyDown}
            data-testid="message-params"
            className="flex items-center h-9 px-3 rounded border border-border-default text-sm bg-background-default text-text-default transition-colors hover:bg-background-hover focus:outline-none focus:ring-2 focus:ring-primary-default"
          />
        </Box>
        <Box className="flex flex-none lg:w-[80px] items-end">
          <Button
            variant={ButtonVariant.Primary}
            size={ButtonSize.Sm}
            onClick={handleSend}
            isDisabled={!(target.trim() && method.trim())}
            className="h-9 rounded-md"
            data-testid="message-send-button"
          >
            <TextComponent
              variant={TextVariant.BodyMd}
              color={TextColor.PrimaryInverse}
              className="select-none"
            >
              Send
            </TextComponent>
          </Button>
        </Box>
      </Box>
      {result && (
        <Box className="mt-4 font-mono text-sm" data-testid="message-response">
          <TextComponent
            variant={TextVariant.BodySm}
            fontWeight={FontWeight.Medium}
            className="mb-2"
          >
            Response:
          </TextComponent>
          <pre className="p-3 rounded overflow-auto bg-background-default">
            {stringify(result, 0)}
          </pre>
        </Box>
      )}
    </Box>
  );
};
