import {
  Box,
  BoxFlexDirection,
  BoxFlexWrap,
  ButtonBase,
  Icon,
  IconName,
} from '@metamask/design-system-react';

import { useKernelActions } from '../hooks/useKernelActions.ts';
import { useVats } from '../hooks/useVats.ts';

/**
 * @returns A panel for controlling the kernel.
 */
export const KernelControls: React.FC = () => {
  const { terminateAllVats, collectGarbage, clearState, reload } =
    useKernelActions();
  const { hasVats } = useVats();

  return (
    <Box
      flexDirection={BoxFlexDirection.Row}
      flexWrap={BoxFlexWrap.Wrap}
      className="mb-4"
      gap={2}
    >
      {hasVats && (
        <ButtonBase
          className="h-auto flex-1 flex-col justify-center rounded-lg bg-muted py-4 hover:bg-muted-hover active:bg-muted-pressed"
          onClick={terminateAllVats}
        >
          <Icon name={IconName.Ban} className="mb-2" />
          Terminate All Vats
        </ButtonBase>
      )}
      <ButtonBase
        className="h-auto flex-1 flex-col justify-center rounded-lg bg-muted py-4 hover:bg-muted-hover active:bg-muted-pressed"
        onClick={collectGarbage}
      >
        <Icon name={IconName.Trash} className="mb-2" />
        Collect Garbage
      </ButtonBase>
      <ButtonBase
        className="h-auto flex-1 flex-col justify-center rounded-lg bg-muted py-4 hover:bg-muted-hover active:bg-muted-pressed"
        onClick={clearState}
      >
        <Icon name={IconName.Data} className="mb-2" />
        Clear All State
      </ButtonBase>
      <ButtonBase
        className="h-auto flex-1 flex-col justify-center rounded-lg bg-muted py-4 hover:bg-muted-hover active:bg-muted-pressed"
        onClick={reload}
      >
        <Icon name={IconName.Refresh} className="mb-2" />
        Reload Kernel
      </ButtonBase>
    </Box>
  );
};
