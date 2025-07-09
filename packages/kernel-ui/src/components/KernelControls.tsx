import {
  Button,
  ButtonBaseSize,
  ButtonVariant,
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
    <div className="headerControls">
      {hasVats && (
        <Button
          size={ButtonBaseSize.Md}
          variant={ButtonVariant.Secondary}
          onClick={terminateAllVats}
        >
          Terminate All Vats
        </Button>
      )}
      <Button
        size={ButtonBaseSize.Md}
        variant={ButtonVariant.Secondary}
        onClick={collectGarbage}
      >
        Collect Garbage
      </Button>
      <Button
        size={ButtonBaseSize.Md}
        variant={ButtonVariant.Primary}
        isDanger
        onClick={clearState}
      >
        Clear All State
      </Button>
      <Button
        size={ButtonBaseSize.Md}
        variant={ButtonVariant.Primary}
        onClick={reload}
      >
        Reload Kernel
      </Button>
    </div>
  );
};
