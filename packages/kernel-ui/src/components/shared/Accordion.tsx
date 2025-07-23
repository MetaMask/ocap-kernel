import { Box, Icon, IconName } from '@metamask/design-system-react';
import { useState } from 'react';

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
    <Box
      className="mb-4 border border-border-default hover:border-primary-default rounded-lg overflow-hidden"
      data-testid={testId}
    >
      <Box
        className="flex justify-between items-center p-3 cursor-pointer transition-colors select-none"
        onClick={handleToggle}
        data-testid="accordion-header"
      >
        <Box className="flex items-center" data-testid="accordion-title">
          {title}
        </Box>
        <Box className="text-lg w-5 h-5 flex items-center justify-center text-text-muted">
          <Icon name={isExpanded ? IconName.Minus : IconName.Add} />
        </Box>
      </Box>
      {isExpanded && <Box data-testid="accordion-content">{children}</Box>}
    </Box>
  );
};
