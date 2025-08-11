import {
  Text as TextComponent,
  TextVariant,
  TextColor,
  FontWeight,
} from '@metamask/design-system-react';

export const TableHeader: React.FC<{
  first?: boolean;
  variant?: TextVariant;
}> = ({ first, variant = TextVariant.BodyXs, children }) => {
  return (
    <th
      className={`text-left py-2 px-3 ${first ? 'border-r border-muted' : ''}`}
    >
      <TextComponent
        variant={variant}
        fontWeight={
          variant === TextVariant.BodyXs
            ? FontWeight.Medium
            : FontWeight.Regular
        }
        color={TextColor.TextMuted}
      >
        {children}
      </TextComponent>
    </th>
  );
};
