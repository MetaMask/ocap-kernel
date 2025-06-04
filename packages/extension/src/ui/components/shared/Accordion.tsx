import { useState } from 'react';

import styles from '../../App.module.css';

export type AccordionProps = {
  title: React.ReactNode;
  children: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: (isExpanded: boolean) => void;
  testId?: string;
};

/**
 * A reusable accordion component that can expand and collapse content.
 *
 * @param props - The accordion props.
 * @param props.title - The title to display in the accordion header.
 * @param props.children - The content to display when expanded.
 * @param props.isExpanded - Whether the accordion is expanded (controlled).
 * @param props.onToggle - Callback when the accordion is toggled.
 * @param props.testId - Test ID for the accordion container.
 * @returns An accordion component.
 */
export const Accordion: React.FC<AccordionProps> = ({
  title,
  children,
  isExpanded: controlledExpanded,
  onToggle,
  testId,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);

  // Use controlled state if provided, otherwise use internal state
  const isExpanded = controlledExpanded ?? internalExpanded;

  const handleToggle = (): void => {
    const newExpanded = !isExpanded;

    if (onToggle) {
      onToggle(newExpanded);
    } else {
      setInternalExpanded(newExpanded);
    }
  };

  return (
    <div className={styles.accordion} data-testid={testId}>
      <div
        className={`accordion-header ${styles.accordionHeader}`}
        onClick={handleToggle}
      >
        <div className={`accordion-title ${styles.accordionTitle}`}>
          {title}
        </div>
        <div className={styles.accordionIndicator}>
          {isExpanded ? '−' : '+'}
        </div>
      </div>

      {isExpanded && <div className={styles.accordionContent}>{children}</div>}
    </div>
  );
};
