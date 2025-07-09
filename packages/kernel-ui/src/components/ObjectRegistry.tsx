import {
  Button,
  ButtonVariant,
  ButtonBaseSize,
} from '@metamask/design-system-react';
import { useEffect, useState } from 'react';

import { SendMessageForm } from './SendMessageForm.tsx';
import { Accordion } from './shared/Accordion.tsx';
import { usePanelContext } from '../context/PanelContext.tsx';
import { useRegistry } from '../hooks/useRegistry.ts';
import type { VatSnapshot } from '../types.ts';

const VatDetailsHeader: React.FC<{ data: VatSnapshot }> = ({ data }) => {
  const objects = data.ownedObjects.length + data.importedObjects.length;
  const promises = data.importedPromises.length + data.exportedPromises.length;
  return (
    <span className="vatDetailsHeader">
      {objects} object{objects === 1 ? '' : 's'}, {promises} promise
      {promises === 1 ? '' : 's'}
    </span>
  );
};

export const ObjectRegistry: React.FC = () => {
  const { objectRegistry } = usePanelContext();
  const { fetchObjectRegistry, revoke } = useRegistry();
  const [expandedVats, setExpandedVats] = useState<Record<string, boolean>>({});

  const toggleVat = (vatId: string): void => {
    setExpandedVats((prev) => ({
      ...prev,
      [vatId]: !prev[vatId],
    }));
  };

  // Fetch the object registry when the component mounts
  useEffect(() => {
    fetchObjectRegistry();
  }, [fetchObjectRegistry]);

  if (!objectRegistry) {
    return <p className="error">Loading...</p>;
  }

  return (
    <div className="vat-details-header">
      <SendMessageForm />

      <div className="headerSection">
        <h2 className="noMargin">Kernel Registry</h2>
        <Button
          variant={ButtonVariant.Secondary}
          data-testid="refresh-registry-button"
          onClick={fetchObjectRegistry}
        >
          Refresh
        </Button>
      </div>

      <table className="noBorder table">
        <tbody>
          <tr>
            <td width="160">GC Actions</td>
            <td>{objectRegistry.gcActions ?? 'None'}</td>
          </tr>
          <tr>
            <td width="160">Reap Queue</td>
            <td>{objectRegistry.reapQueue ?? 'Empty'}</td>
          </tr>
          <tr>
            <td width="160">Terminated Vats</td>
            <td>{objectRegistry.terminatedVats ?? 'None'}</td>
          </tr>
        </tbody>
      </table>

      <h3>Vats</h3>

      {Object.entries(objectRegistry.vats).map(([vatId, vatData]) => {
        return (
          <Accordion
            key={vatId}
            title={
              <>
                {vatData.overview.name} ({vatId}) -{' '}
                <VatDetailsHeader data={vatData} />
              </>
            }
            isExpanded={expandedVats[vatId] ?? false}
            onToggle={(_isExpanded) => toggleVat(vatId)}
          >
            {vatData.ownedObjects.length > 0 && (
              <div className="tableContainer">
                <h4>Owned Objects</h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>KRef</th>
                      <th>ERef</th>
                      <th>Ref Count</th>
                      <th>To Vat(s)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {vatData.ownedObjects.map((obj, idx) => (
                      <tr key={`owned-${obj.kref}-${idx}`}>
                        <td>{obj.kref}</td>
                        <td>{obj.eref}</td>
                        <td>{obj.refCount}</td>
                        <td>
                          {obj.toVats.length > 0 ? obj.toVats.join(', ') : '—'}
                        </td>
                        <td>
                          <Button
                            variant={ButtonVariant.Secondary}
                            size={ButtonBaseSize.Sm}
                            data-testid={`revoke-button-${obj.kref}`}
                            onClick={() => revoke(obj.kref)}
                            isDisabled={obj.revoked === 'true'}
                          >
                            {obj.revoked === 'true' ? 'Revoked' : 'Revoke'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {vatData.importedObjects.length > 0 && (
              <div className="tableContainer">
                <h4>Imported Objects</h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>KRef</th>
                      <th>ERef</th>
                      <th>Ref Count</th>
                      <th>From Vat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatData.importedObjects.map((obj, idx) => (
                      <tr key={`imported-${obj.kref}-${idx}`}>
                        <td>{obj.kref}</td>
                        <td>{obj.eref}</td>
                        <td>{obj.refCount}</td>
                        <td>{obj.fromVat ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {vatData.importedPromises.length > 0 && (
              <div className="tableContainer">
                <h4>Imported Promises</h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>KRef</th>
                      <th>ERef</th>
                      <th>State</th>
                      <th>Value</th>
                      <th>Slots</th>
                      <th>From Vat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatData.importedPromises.map((promise, idx) => (
                      <tr key={`imported-promise-${promise.kref}-${idx}`}>
                        <td>{promise.kref}</td>
                        <td>{promise.eref}</td>
                        <td>{promise.state}</td>
                        <td>{promise.value.body}</td>
                        <td>
                          {promise.value.slots.length > 0
                            ? promise.value.slots
                                .map(
                                  (slot) =>
                                    `${slot.kref}${slot.eref ? ` (${slot.eref})` : ''}`,
                                )
                                .join(', ')
                            : '—'}
                        </td>
                        <td>{promise.fromVat ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {vatData.exportedPromises.length > 0 && (
              <div className="tableContainer">
                <h4>Exported Promises</h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>KRef</th>
                      <th>ERef</th>
                      <th>State</th>
                      <th>Value</th>
                      <th>Slots</th>
                      <th>To Vat(s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatData.exportedPromises.map((promise, idx) => (
                      <tr key={`exported-promise-${promise.kref}-${idx}`}>
                        <td>{promise.kref}</td>
                        <td>{promise.eref}</td>
                        <td>{promise.state}</td>
                        <td>{promise.value.body}</td>
                        <td>
                          {promise.value.slots.length > 0
                            ? promise.value.slots
                                .map(
                                  (slot) =>
                                    `${slot.kref}${slot.eref ? ` (${slot.eref})` : ''}`,
                                )
                                .join(', ')
                            : '—'}
                        </td>
                        <td>
                          {promise.toVats.length > 0
                            ? promise.toVats.join(', ')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Accordion>
        );
      })}
    </div>
  );
};
