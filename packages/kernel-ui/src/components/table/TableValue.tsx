import {
  Text as TextComponent,
  TextVariant,
  TextColor,
} from '@metamask/design-system-react';

import { TableCell } from './TableCell.tsx';

export const TableValue: React.FC<{
  first?: boolean | undefined;
  children: React.ReactNode;
}> = ({ first, children }) => {
  return (
    <TableCell first={first}>
      <TextComponent variant={TextVariant.BodyXs} color={TextColor.TextDefault}>
        {children}
      </TextComponent>
    </TableCell>
  );
};
