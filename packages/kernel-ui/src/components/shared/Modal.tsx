import {
  Box,
  ButtonIcon,
  ButtonIconSize,
  IconName,
  Text as TextComponent,
  TextVariant,
} from '@metamask/design-system-react';
import { useEffect, useRef } from 'react';

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

/**
 * A modal component that displays content in an overlay.
 *
 * @param props - The modal props.
 * @param props.isOpen - Whether the modal is open.
 * @param props.onClose - Function to call when the modal should be closed.
 * @param props.title - The title to display in the modal header.
 * @param props.children - The content to display in the modal body.
 * @param props.size - The size of the modal.
 * @returns A modal component.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';

      // Focus the modal for accessibility
      if (modalRef.current) {
        modalRef.current.focus();
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle click outside modal to close
  const handleBackdropClick = (
    event: React.MouseEvent<HTMLDivElement>,
  ): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  let widthClass = 'w-2/3';
  if (size === 'sm') {
    widthClass = 'w-96';
  } else if (size === 'lg') {
    widthClass = 'w-4/5';
  }

  return (
    <Box
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`bg-background-default rounded-lg shadow-lg max-h-[90vh] overflow-hidden ${widthClass}`}
        ref={modalRef}
        tabIndex={-1}
      >
        <Box className="flex justify-between items-center bg-alternative p-4 border-b border-muted">
          <TextComponent
            data-testid="modal-title"
            className="!m-0"
            variant={TextVariant.HeadingSm}
          >
            {title}
          </TextComponent>
          <ButtonIcon
            iconName={IconName.Close}
            size={ButtonIconSize.Sm}
            onClick={onClose}
            ariaLabel="Close modal"
          />
        </Box>
        <Box className="p-4 overflow-y-auto">{children}</Box>
      </div>
    </Box>
  );
};
