import type { ReactNode } from 'react';
import { vi } from 'vitest';

/**
 * Design System Mock Setup
 *
 * We need this mock because the @metamask/design-system-react package uses React 16,
 * which causes test failures when trying to render design system components directly in tests.
 *
 * By mocking these components, we can test our components that use the design system
 * without the React version compatibility issues, while still verifying that the
 * correct props are passed and the components render as expected.
 */
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
      variant,
      className,
      id,
      ...props
    }: {
      children?: ReactNode;
      color?: string;
      variant?: string;
      className?: string;
      id?: string;
      [key: string]: unknown;
    }) => (
      <span
        data-testid="text"
        data-color={color}
        data-variant={variant}
        className={className}
        id={id}
        {...props}
      >
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
    ButtonIcon: ({
      iconName,
      size,
      onClick,
      ariaLabel,
      ...props
    }: {
      iconName?: string;
      size?: string;
      onClick?: () => void;
      ariaLabel?: string;
      [key: string]: unknown;
    }) => (
      <button
        data-testid="button-icon"
        data-icon-name={iconName}
        data-size={size}
        onClick={onClick}
        aria-label={ariaLabel}
        {...props}
      >
        {iconName}
      </button>
    ),
    Button: ({
      children,
      onClick,
      startIconName,
      isDisabled,
      'data-testid': dataTestId,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      startIconName?: string;
      isDisabled?: boolean;
      'data-testid'?: string;
      [key: string]: unknown;
    }) => (
      <button
        onClick={onClick}
        data-testid={dataTestId ?? 'button'}
        disabled={isDisabled}
        {...props}
      >
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
      TextDefault: 'text-default',
      TextMuted: 'text-muted',
    },
    TextVariant: {
      BodySm: 'body-sm',
      BodyXs: 'body-xs',
      HeadingSm: 'heading-sm',
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
    ButtonVariant: {
      Primary: 'primary',
      Secondary: 'secondary',
    },
    ButtonSize: {
      Sm: 'sm',
      Md: 'md',
      Lg: 'lg',
    },
    ButtonBaseSize: {
      Sm: 'sm',
      Md: 'md',
      Lg: 'lg',
    },
    ButtonIconSize: {
      Sm: 'sm',
      Md: 'md',
      Lg: 'lg',
    },
    IconName: {
      Add: 'add',
      Ban: 'ban',
      Trash: 'trash',
      Data: 'data',
      Refresh: 'refresh',
      Upload: 'upload',
      Minus: 'minus',
      Close: 'close',
    },
    TextButton: ({
      children,
      onClick,
      'data-testid': dataTestId,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      'data-testid'?: string;
      [key: string]: unknown;
    }) => (
      <button
        onClick={onClick}
        data-testid={dataTestId ?? 'text-button'}
        {...props}
      >
        {children}
      </button>
    ),
    TextButtonSize: {
      BodyXs: 'body-xs',
      BodySm: 'body-sm',
      BodyMd: 'body-md',
      BodyLg: 'body-lg',
    },
  }));
};
