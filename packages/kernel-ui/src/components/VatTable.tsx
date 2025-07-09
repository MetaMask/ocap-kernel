import {
  Button,
  ButtonVariant,
  ButtonBaseSize,
  TextButton,
  TextButtonSize,
} from '@metamask/design-system-react';

import type { VatRecord } from '../types.ts';

export const VatTable: React.FC<{
  vats: VatRecord[];
  onPingVat: (id: string) => void;
  onRestartVat: (id: string) => void;
  onTerminateVat: (id: string) => void;
}> = ({ vats, onPingVat, onRestartVat, onTerminateVat }) => {
  if (vats.length === 0) {
    return null;
  }

  return (
    <div className="table subclusterTable">
      <table data-testid="vat-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Source</th>
            <th>Parameters</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {vats.map((vat) => (
            <tr key={vat.id} data-vat-id={vat.id}>
              <td>{vat.id}</td>
              <td>{vat.source}</td>
              <td>{vat.parameters}</td>
              <td>
                <div className="tableActions">
                  <TextButton
                    size={TextButtonSize.BodyXs}
                    onClick={() => onPingVat(vat.id)}
                    className="min-w-0"
                  >
                    Ping
                  </TextButton>
                  <TextButton
                    size={TextButtonSize.BodyXs}
                    onClick={() => onRestartVat(vat.id)}
                    className="min-w-0"
                  >
                    Restart
                  </TextButton>
                  <TextButton
                    size={TextButtonSize.BodyXs}
                    onClick={() => onTerminateVat(vat.id)}
                    className="min-w-0"
                  >
                    Terminate
                  </TextButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
