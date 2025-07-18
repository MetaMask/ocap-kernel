import type { ReactNode } from 'react';

export const setupDesignSystemMock = () => {
  vi.mock('@metamask/design-system-react', () => ({
    Box: ({
      children,
      className,
      ...props
    }: {
      children?: ReactNode;
      className?: string;
      [key: string]: unknown;
    }) => (
      <div data-testid="box" className={className} {...props}>
        {children}
      </div>
    ),
    Text: ({
      children,
      color,
      ...props
    }: {
      children?: ReactNode;
      color?: string;
      [key: string]: unknown;
    }) => (
      <span data-testid="text" data-color={color} {...props}>
        {children}
      </span>
    ),
    ButtonBase: ({
      children,
      onClick,
      ...props
    }: {
      children?: ReactNode;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button data-testid="button-base" onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Icon: ({
      name,
      className,
      ...props
    }: {
      name?: string;
      className?: string;
      [key: string]: unknown;
    }) => (
      <span
        data-testid="icon"
        data-name={name}
        className={className}
        {...props}
      >
        {name}
      </span>
    ),
    TextColor: {
      ErrorDefault: 'error',
      Default: 'default',
      TextAlternative: 'text-alternative',
      PrimaryInverse: 'primary-inverse',
    },
    TextVariant: {
      BodySm: 'body-sm',
      BodyXs: 'body-xs',
    },
    FontWeight: {
      Medium: 'medium',
    },
    BoxFlexDirection: {
      Row: 'row',
      Column: 'column',
    },
    BoxFlexWrap: {
      Wrap: 'wrap',
      NoWrap: 'nowrap',
    },
    IconName: {
      Ban: 'ban',
      Trash: 'trash',
      Data: 'data',
      Refresh: 'refresh',
      Upload: 'upload',
    },
  }));
};
