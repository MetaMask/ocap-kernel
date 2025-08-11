import {
  TextButton,
  TextButtonSize,
  Box,
  IconName,
  ButtonIcon,
} from '@metamask/design-system-react';

import type { VatRecord } from '../types.ts';
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableValue,
} from './table/index.ts';

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
      <Table dataTestid="vat-table">
        <TableHead>
          <TableHeader first>ID</TableHeader>
          <TableHeader>Source</TableHeader>
          <TableHeader>Parameters</TableHeader>
          <TableHeader>Actions</TableHeader>
        </TableHead>
        <tbody>
          {vats.map((vat, index) => (
            <tr
              key={vat.id}
              data-vat-id={vat.id}
              className={`hover:bg-alternative ${
                index === vats.length - 1 ? '' : 'border-b border-muted'
              }`}
            >
              <TableValue first>{vat.id}</TableValue>
              <TableValue>{vat.source}</TableValue>
              <TableValue>{vat.parameters}</TableValue>
              <TableCell>
                <Box className="flex gap-2">
                  <Box className="flex flex-1">
                    <TextButton
                      size={TextButtonSize.BodyXs}
                      onClick={() => onPingVat(vat.id)}
                      className="min-w-0"
                      data-testid="ping-vat-button"
                    >
                      Ping
                    </TextButton>
                  </Box>
                  <ButtonIcon
                    iconName={IconName.Refresh}
                    ariaLabel="Restart"
                    onClick={() => onRestartVat(vat.id)}
                    data-testid="restart-vat-button"
                  />
                  <ButtonIcon
                    iconName={IconName.Trash}
                    ariaLabel="Terminate"
                    onClick={() => onTerminateVat(vat.id)}
                    data-testid="terminate-vat-button"
                  />
                </Box>
              </TableCell>
            </tr>
          ))}
        </tbody>
      </Table>
    </Box>
  );
};
