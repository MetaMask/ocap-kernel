import type { Json } from '@metamask/utils';
import { stringify } from '@ocap/utils';
import { useState, useMemo } from 'react';

import styles from '../App.module.css';
import { usePanelContext } from '../context/PanelContext.tsx';
import { useDatabase } from '../hooks/useDatabase.ts';

/**
 * Renders a form for users to queue a message to a vat.
 *
 * @returns JSX element for queue message form
 */
export const SendMessageForm: React.FC = () => {
  const { callKernelMethod, logMessage, objectRegistry } = usePanelContext();
  const { fetchObjectRegistry } = useDatabase();
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
    <div className={styles.messageInputSection}>
      <h3>Send Message</h3>
      <div className={styles.horizontalForm}>
        <div style={{ width: 150, flex: 'none' }}>
          <label htmlFor="message-target">Target:</label>
          <select
            id="message-target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            data-testid="message-target"
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
        </div>
        <div>
          <label htmlFor="message-method">Method:</label>
          <input
            id="message-method"
            type="text"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            placeholder="methodName"
            onKeyDown={handleKeyDown}
            data-testid="message-method"
          />
        </div>
        <div>
          <label htmlFor="message-params">Params (JSON):</label>
          <input
            id="message-params"
            value={paramsText}
            onChange={(event) => setParamsText(event.target.value)}
            placeholder="[arg1, arg2]"
            onKeyDown={handleKeyDown}
            data-testid="message-params"
          />
        </div>
        <div style={{ flex: 'none', width: 66, paddingTop: 18 }}>
          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={!(target.trim() && method.trim())}
            data-testid="message-send-button"
          >
            Send
          </button>
        </div>
      </div>
      {result && (
        <div className={styles.messageResponse} data-testid="message-response">
          <h4>Response:</h4>
          <pre>{stringify(result, 0)}</pre>
        </div>
      )}
    </div>
  );
};
