import {
  TextButton,
  TextButtonSize,
  Box,
  IconName,
  ButtonIcon,
  Text as TextComponent,
  TextVariant,
  TextColor,
  FontWeight,
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
    <Box className="w-full mt-4">
      <table
        data-testid="vat-table"
        className="w-full border-collapse border-t border-muted"
      >
        <thead>
          <tr className="border-b border-muted">
            <th className="text-left py-2 px-3 border-r border-muted">
              <TextComponent
                variant={TextVariant.BodyXs}
                fontWeight={FontWeight.Medium}
                color={TextColor.TextMuted}
              >
                ID
              </TextComponent>
            </th>
            <th className="text-left py-2 px-3">
              <TextComponent
                variant={TextVariant.BodyXs}
                fontWeight={FontWeight.Medium}
                color={TextColor.TextMuted}
              >
                Source
              </TextComponent>
            </th>
            <th className="text-left py-2 px-3">
              <TextComponent
                variant={TextVariant.BodyXs}
                fontWeight={FontWeight.Medium}
                color={TextColor.TextMuted}
              >
                Parameters
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
          {vats.map((vat, index) => (
            <tr
              key={vat.id}
              data-vat-id={vat.id}
              className={`hover:bg-alternative ${
                index === vats.length - 1 ? '' : 'border-b border-muted'
              }`}
            >
              <td className="py-1 px-3 border-r border-muted">
                <TextComponent
                  variant={TextVariant.BodyXs}
                  color={TextColor.TextDefault}
                >
                  {vat.id}
                </TextComponent>
              </td>
              <td className="py-1 px-3">
                <TextComponent
                  variant={TextVariant.BodyXs}
                  color={TextColor.TextDefault}
                >
                  {vat.source}
                </TextComponent>
              </td>
              <td className="py-1 px-3">
                <TextComponent
                  variant={TextVariant.BodyXs}
                  color={TextColor.TextDefault}
                >
                  {vat.parameters}
                </TextComponent>
              </td>
              <td className="py-1 px-3">
                <Box className="flex gap-2">
                  <Box className="flex flex-1">
                    <TextButton
                      size={TextButtonSize.BodyXs}
                      onClick={() => onPingVat(vat.id)}
                      className="min-w-0"
                    >
                      Ping
                    </TextButton>
                  </Box>
                  <ButtonIcon
                    iconName={IconName.Refresh}
                    ariaLabel="Restart"
                    onClick={() => onRestartVat(vat.id)}
                  />
                  <ButtonIcon
                    iconName={IconName.Trash}
                    ariaLabel="Terminate"
                    onClick={() => onTerminateVat(vat.id)}
                  />
                </Box>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
};
