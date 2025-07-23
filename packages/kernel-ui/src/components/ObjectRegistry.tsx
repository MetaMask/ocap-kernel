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
                >
                  Owned Objects
                </TextComponent>
                <Box className="w-full">
                  <table className="w-full border-collapse border-t border-muted">
                    <thead>
                      <tr className="border-b border-muted">
                        <th className="text-left py-2 px-3 border-r border-muted">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            KRef
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            ERef
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            Ref Count
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            To Vat(s)
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            Actions
                          </TextComponent>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatData.ownedObjects.map((obj, idx) => (
                        <tr
                          key={`owned-${obj.kref}-${idx}`}
                          className="hover:bg-alternative border-b border-muted"
                        >
                          <td className="py-1 px-3 border-r border-muted">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {obj.kref}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {obj.eref}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {obj.refCount}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {obj.toVats.length > 0
                                ? obj.toVats.join(', ')
                                : '—'}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </Box>
            )}

            {vatData.importedObjects.length > 0 && (
              <Box className="mt-6">
                <TextComponent
                  variant={TextVariant.BodySm}
                  fontWeight={FontWeight.Medium}
                  className="mb-3 px-3"
                >
                  Imported Objects
                </TextComponent>
                <Box className="w-full">
                  <table className="w-full border-collapse border-t border-muted">
                    <thead>
                      <tr className="border-b border-muted">
                        <th className="text-left py-2 px-3 border-r border-muted">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            KRef
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            ERef
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            Ref Count
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            From Vat
                          </TextComponent>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatData.importedObjects.map((obj, idx) => (
                        <tr
                          key={`imported-${obj.kref}-${idx}`}
                          className="hover:bg-alternative border-b border-muted"
                        >
                          <td className="py-1 px-3 border-r border-muted">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {obj.kref}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {obj.eref}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {obj.refCount}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {obj.fromVat ?? '—'}
                            </TextComponent>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </Box>
            )}

            {vatData.importedPromises.length > 0 && (
              <Box className="mt-6">
                <TextComponent
                  variant={TextVariant.BodySm}
                  fontWeight={FontWeight.Medium}
                  className="mb-3 px-3"
                >
                  Imported Promises
                </TextComponent>
                <Box className="w-full">
                  <table className="w-full border-collapse border-t border-muted">
                    <thead>
                      <tr className="border-b border-muted">
                        <th className="text-left py-2 px-3 border-r border-muted">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            KRef
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            ERef
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            State
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            Value
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            Slots
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            From Vat
                          </TextComponent>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatData.importedPromises.map((promise, idx) => (
                        <tr
                          key={`imported-promise-${promise.kref}-${idx}`}
                          className="hover:bg-alternative border-b border-muted"
                        >
                          <td className="py-1 px-3 border-r border-muted">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.kref}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.eref}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.state}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.value.body}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.value.slots.length > 0
                                ? promise.value.slots
                                    .map(
                                      (slot) =>
                                        `${slot.kref}${slot.eref ? ` (${slot.eref})` : ''}`,
                                    )
                                    .join(', ')
                                : '—'}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.fromVat ?? '—'}
                            </TextComponent>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </Box>
            )}

            {vatData.exportedPromises.length > 0 && (
              <Box className="mt-6">
                <TextComponent
                  variant={TextVariant.BodySm}
                  fontWeight={FontWeight.Medium}
                  className="mb-3 px-3"
                >
                  Exported Promises
                </TextComponent>
                <Box className="w-full">
                  <table className="w-full border-collapse border-t border-muted">
                    <thead>
                      <tr className="border-b border-muted">
                        <th className="text-left py-2 px-3 border-r border-muted">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            KRef
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            ERef
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            State
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            Value
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            Slots
                          </TextComponent>
                        </th>
                        <th className="text-left py-2 px-3">
                          <TextComponent
                            variant={TextVariant.BodyXs}
                            fontWeight={FontWeight.Medium}
                            color={TextColor.TextMuted}
                          >
                            To Vat(s)
                          </TextComponent>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatData.exportedPromises.map((promise, idx) => (
                        <tr
                          key={`exported-promise-${promise.kref}-${idx}`}
                          className="hover:bg-alternative border-b border-muted"
                        >
                          <td className="py-1 px-3 border-r border-muted">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.kref}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.eref}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.state}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.value.body}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.value.slots.length > 0
                                ? promise.value.slots
                                    .map(
                                      (slot) =>
                                        `${slot.kref}${slot.eref ? ` (${slot.eref})` : ''}`,
                                    )
                                    .join(', ')
                                : '—'}
                            </TextComponent>
                          </td>
                          <td className="py-1 px-3">
                            <TextComponent
                              variant={TextVariant.BodyXs}
                              color={TextColor.TextDefault}
                            >
                              {promise.toVats.length > 0
                                ? promise.toVats.join(', ')
                                : '—'}
                            </TextComponent>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </Box>
            )}
          </Accordion>
        );
      })}
    </Box>
  );
};
