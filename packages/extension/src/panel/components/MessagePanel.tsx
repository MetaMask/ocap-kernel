import { VatCommandMethod, KernelCommandMethod } from '@ocap/kernel';
import type { KernelCommand } from '@ocap/kernel';

import { usePanelContext } from '../context/PanelContext.js';
import { useKernelActions } from '../hooks/useKernelActions.js';

const commonMessages: Record<string, KernelCommand> = {
  Ping: { method: VatCommandMethod.ping, params: null },
  Evaluate: {
    method: VatCommandMethod.evaluate,
    params: `[1,2,3].join(',')`,
  },
  KVSet: {
    method: KernelCommandMethod.kvSet,
    params: { key: 'foo', value: 'bar' },
  },
  KVGet: { method: KernelCommandMethod.kvGet, params: 'foo' },
};

/**
 * @returns A panel for sending messages to the kernel.
 */
export const MessagePanel: React.FC = () => {
  const { messageContent, setMessageContent, panelLogs } = usePanelContext();
  const { sendKernelCommand } = useKernelActions();

  return (
    <div className="message-panel">
      <h4>Send Message</h4>
      <div className="message-templates">
        {Object.entries(commonMessages).map(([name, template]) => (
          <button
            key={name}
            className="text-button template"
            onClick={() => setMessageContent(JSON.stringify(template, null, 2))}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="message-input-row">
        <input
          type="text"
          value={messageContent}
          onChange={(event) => setMessageContent(event.target.value)}
          placeholder="Enter message (as JSON)"
        />
        <button onClick={sendKernelCommand} disabled={!messageContent.trim()}>
          Send
        </button>
      </div>
      <div id="output-box">
        <h4>Output</h4>
        <div className="output-logs">
          {panelLogs.map((log) => (
            <div key={log.message} className={log.type}>
              {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
