import {
  Button,
  ButtonVariant,
  ButtonBaseSize,
  Box,
  Text as TextComponent,
  TextVariant,
  TextColor,
  FontWeight,
  ButtonSize,
  IconName,
} from '@metamask/design-system-react';
import { useEffect, useState } from 'react';

import { SendMessageForm } from './SendMessageForm.tsx';
import { Accordion } from './shared/Accordion.tsx';
import { usePanelContext } from '../context/PanelContext.tsx';
import { useRegistry } from '../hooks/useRegistry.ts';
import type { VatSnapshot } from '../types.ts';
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableValue,
} from './table/index.ts';

const VatDetailsHeader: React.FC<{ data: VatSnapshot }> = ({ data }) => {
  const objects = data.ownedObjects.length + data.importedObjects.length;
  const promises = data.importedPromises.length + data.exportedPromises.length;
  return (
    <TextComponent
      variant={TextVariant.BodySm}
      color={TextColor.TextMuted}
      fontWeight={FontWeight.Regular}
      className="ml-1"
      data-testid="vat-details-header"
    >
      {objects} object{objects === 1 ? '' : 's'}, {promises} promise
      {promises === 1 ? '' : 's'}
    </TextComponent>
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
    return (
      <TextComponent color={TextColor.ErrorDefault}>Loading...</TextComponent>
    );
  }

  return (
    <Box>
      <SendMessageForm />

      <Box className="flex justify-between items-center mb-6 mt-6">
        <TextComponent
          variant={TextVariant.HeadingSm}
          fontWeight={FontWeight.Medium}
          className="m-0"
        >
          Kernel Registry
        </TextComponent>
        <Button
          variant={ButtonVariant.Secondary}
          size={ButtonSize.Md}
          data-testid="refresh-registry-button"
          startIconName={IconName.Refresh}
          onClick={fetchObjectRegistry}
          className="rounded-md"
        >
          <TextComponent
            variant={TextVariant.BodySm}
            fontWeight={FontWeight.Medium}
            className="select-none"
          >
            Refresh
          </TextComponent>
        </Button>
      </Box>

      <Box className="w-full mb-6">
        <table className="w-full border-collapse">
          <tbody>
            <tr className="border-b border-muted">
              <td className="py-2 px-3 border-r border-muted w-40">
                <TextComponent
                  variant={TextVariant.BodySm}
                  color={TextColor.TextDefault}
                >
                  GC Actions
                </TextComponent>
              </td>
              <td className="py-2 px-3">
                <TextComponent
                  variant={TextVariant.BodySm}
                  color={TextColor.TextDefault}
                >
                  {objectRegistry.gcActions ?? 'None'}
                </TextComponent>
              </td>
            </tr>
            <tr className="border-b border-muted">
              <td className="py-2 px-3 border-r border-muted w-40">
                <TextComponent
                  variant={TextVariant.BodySm}
                  color={TextColor.TextDefault}
                >
                  Reap Queue
                </TextComponent>
              </td>
              <td className="py-2 px-3">
                <TextComponent
                  variant={TextVariant.BodySm}
                  color={TextColor.TextDefault}
                >
                  {objectRegistry.reapQueue ?? 'Empty'}
                </TextComponent>
              </td>
            </tr>
            <tr className="border-b border-muted">
              <td className="py-2 px-3 border-r border-muted w-40">
                <TextComponent
                  variant={TextVariant.BodySm}
                  color={TextColor.TextDefault}
                >
                  Terminated Vats
                </TextComponent>
              </td>
              <td className="py-2 px-3">
                <TextComponent
                  variant={TextVariant.BodySm}
                  color={TextColor.TextDefault}
                >
                  {objectRegistry.terminatedVats ?? 'None'}
                </TextComponent>
              </td>
            </tr>
          </tbody>
        </table>
      </Box>

      <TextComponent
        variant={TextVariant.HeadingSm}
        fontWeight={FontWeight.Medium}
        className="mb-4"
      >
        Vats
      </TextComponent>

      {Object.entries(objectRegistry.vats).map(([vatId, vatData]) => {
        return (
          <Accordion
            key={vatId}
            title={
              <>
                <TextComponent
                  variant={TextVariant.BodySm}
                  fontWeight={FontWeight.Medium}
                  color={TextColor.TextDefault}
                >
                  {vatData.overview.name} ({vatId}) -{' '}
                </TextComponent>
                <VatDetailsHeader data={vatData} />
              </>
            }
            isExpanded={expandedVats[vatId] ?? false}
            onToggle={(_isExpanded) => toggleVat(vatId)}
          >
            {vatData.ownedObjects.length > 0 && (
              <Box className="mt-6">
                <TextComponent
                  variant={TextVariant.BodySm}
                  fontWeight={FontWeight.Medium}
                  className="mb-3 px-3"
                  data-testid="table-heading"
                >
                  Owned Objects
                </TextComponent>
                <Box className="w-full">
                  <Table>
                    <TableHead>
                      <TableHeader first>KRef</TableHeader>
                      <TableHeader>ERef</TableHeader>
                      <TableHeader>Ref Count</TableHeader>
                      <TableHeader>To Vat(s)</TableHeader>
                      <TableHeader>Actions</TableHeader>
                    </TableHead>
                    <tbody>
                      {vatData.ownedObjects.map((obj, idx) => (
                        <tr
                          key={`owned-${obj.kref}-${idx}`}
                          className="hover:bg-alternative border-b border-muted"
                        >
                          <TableValue first>{obj.kref}</TableValue>
                          <TableValue>{obj.eref}</TableValue>
                          <TableValue>{obj.refCount}</TableValue>
                          <TableValue>
                            {obj.toVats.length > 0
                              ? obj.toVats.join(', ')
                              : '—'}
                          </TableValue>
                          <TableCell>
                            <Button
                              variant={ButtonVariant.Secondary}
                              isDanger
                              size={ButtonBaseSize.Sm}
                              data-testid={`revoke-button-${obj.kref}`}
                              onClick={() => revoke(obj.kref)}
                              isDisabled={obj.revoked === 'true'}
                              className="rounded-md"
                            >
                              <TextComponent
                                variant={TextVariant.BodyXs}
                                fontWeight={FontWeight.Medium}
                                color={TextColor.ErrorDefault}
                                className="select-none"
                              >
                                {obj.revoked === 'true' ? 'Revoked' : 'Revoke'}
                              </TextComponent>
                            </Button>
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Box>
              </Box>
            )}

            {vatData.importedObjects.length > 0 && (
              <Box className="mt-6">
                <TextComponent
                  variant={TextVariant.BodySm}
                  fontWeight={FontWeight.Medium}
                  className="mb-3 px-3"
                  data-testid="table-heading"
                >
                  Imported Objects
                </TextComponent>
                <Box className="w-full">
                  <Table>
                    <TableHead>
                      <TableHeader first>KRef</TableHeader>
                      <TableHeader>ERef</TableHeader>
                      <TableHeader>Ref Count</TableHeader>
                      <TableHeader>From Vat</TableHeader>
                    </TableHead>
                    <tbody>
                      {vatData.importedObjects.map((obj, idx) => (
                        <tr
                          key={`imported-${obj.kref}-${idx}`}
                          className="hover:bg-alternative border-b border-muted"
                        >
                          <TableValue first>{obj.kref}</TableValue>
                          <TableValue>{obj.eref}</TableValue>
                          <TableValue>{obj.refCount}</TableValue>
                          <TableValue>{obj.fromVat ?? '—'}</TableValue>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Box>
              </Box>
            )}

            {vatData.importedPromises.length > 0 && (
              <Box className="mt-6">
                <TextComponent
                  variant={TextVariant.BodySm}
                  fontWeight={FontWeight.Medium}
                  className="mb-3 px-3"
                  data-testid="table-heading"
                >
                  Imported Promises
                </TextComponent>
                <Box className="w-full">
                  <Table>
                    <TableHead>
                      <TableHeader first>KRef</TableHeader>
                      <TableHeader>ERef</TableHeader>
                      <TableHeader>State</TableHeader>
                      <TableHeader>Value</TableHeader>
                      <TableHeader>Slots</TableHeader>
                      <TableHeader>From Vat</TableHeader>
                    </TableHead>
                    <tbody>
                      {vatData.importedPromises.map((promise, idx) => (
                        <tr
                          key={`imported-promise-${promise.kref}-${idx}`}
                          className="hover:bg-alternative border-b border-muted"
                        >
                          <TableValue first>{promise.kref}</TableValue>
                          <TableValue>{promise.eref}</TableValue>
                          <TableValue>{promise.state}</TableValue>
                          <TableValue>{promise.value.body}</TableValue>
                          <TableValue>
                            {promise.value.slots.length > 0
                              ? promise.value.slots
                                  .map(
                                    (slot) =>
                                      `${slot.kref}${slot.eref ? ` (${slot.eref})` : ''}`,
                                  )
                                  .join(', ')
                              : '—'}
                          </TableValue>
                          <TableValue>{promise.fromVat ?? '—'}</TableValue>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Box>
              </Box>
            )}

            {vatData.exportedPromises.length > 0 && (
              <Box className="mt-6">
                <TextComponent
                  variant={TextVariant.BodySm}
                  fontWeight={FontWeight.Medium}
                  className="mb-3 px-3"
                  data-testid="table-heading"
                >
                  Exported Promises
                </TextComponent>
                <Box className="w-full">
                  <Table>
                    <TableHead>
                      <TableHeader first>KRef</TableHeader>
                      <TableHeader>ERef</TableHeader>
                      <TableHeader>State</TableHeader>
                      <TableHeader>Value</TableHeader>
                      <TableHeader>Slots</TableHeader>
                      <TableHeader>To Vat(s)</TableHeader>
                    </TableHead>
                    <tbody>
                      {vatData.exportedPromises.map((promise, idx) => (
                        <tr
                          key={`exported-promise-${promise.kref}-${idx}`}
                          className="hover:bg-alternative border-b border-muted"
                        >
                          <TableValue first>{promise.kref}</TableValue>
                          <TableValue>{promise.eref}</TableValue>
                          <TableValue>{promise.state}</TableValue>
                          <TableValue>{promise.value.body}</TableValue>
                          <TableValue>
                            {promise.value.slots.length > 0
                              ? promise.value.slots
                                  .map(
                                    (slot) =>
                                      `${slot.kref}${slot.eref ? ` (${slot.eref})` : ''}`,
                                  )
                                  .join(', ')
                              : '—'}
                          </TableValue>
                          <TableValue>
                            {promise.toVats.length > 0
                              ? promise.toVats.join(', ')
                              : '—'}
                          </TableValue>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Box>
              </Box>
            )}
          </Accordion>
        );
      })}
    </Box>
  );
};
