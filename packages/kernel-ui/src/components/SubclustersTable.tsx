import { Box, Text as TextComponent } from '@metamask/design-system-react';

import { SubclusterAccordion } from './SubclusterAccordion.tsx';
import { useVats } from '../hooks/useVats.ts';

/**
 * @returns A set of accordion-style tables for active vats, grouped by subcluster.
 */
export const SubclustersTable: React.FC = () => {
  const {
    subclusters,
    pingVat,
    restartVat,
    terminateVat,
    terminateSubcluster,
    reloadSubcluster,
  } = useVats();

  if (!subclusters || subclusters.length === 0) {
    return (
      <TextComponent className="text-warning-inverse text-s-body-md leading-s-body-md tracking-s-body-md md:text-l-body-md md:leading-l-body-md md:tracking-l-body-md font-regular bg-warning-default p-4 font-default rounded-lg mb-4">
        No subclusters are currently active.
      </TextComponent>
    );
  }

  return (
    <Box className="mb-4">
      {subclusters.map((subcluster) => (
        <SubclusterAccordion
          key={subcluster.id}
          id={subcluster.id}
          vats={subcluster.vatRecords}
          config={subcluster.config}
          onPingVat={pingVat}
          onRestartVat={restartVat}
          onTerminateVat={terminateVat}
          onTerminateSubcluster={terminateSubcluster}
          onReloadSubcluster={reloadSubcluster}
        />
      ))}
    </Box>
  );
};
