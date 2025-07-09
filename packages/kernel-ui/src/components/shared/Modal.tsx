import {
  ButtonIcon,
  ButtonIconSize,
  IconName,
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

  return (
    <div
      className="modalBackdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className={`modalContent ${size}`} ref={modalRef} tabIndex={-1}>
        <div className="modalHeader">
          <h3 id="modal-title" className="modalTitle">
            {title}
          </h3>
          <ButtonIcon
            iconName={IconName.Close}
            size={ButtonIconSize.Sm}
            onClick={onClose}
            ariaLabel="Close modal"
          />
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
};
