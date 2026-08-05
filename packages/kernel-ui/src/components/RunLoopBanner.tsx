import {
  Box,
  Text as TextComponent,
  TextColor,
  TextVariant,
  FontWeight,
} from '@metamask/design-system-react';

import { usePanelContext } from '../context/PanelContext.tsx';

type StaleStateAlert = {
  testId: string;
  headline: string;
  detail: string;
};

/**
 * @param status - The last known kernel status, if any has arrived.
 * @param isUnreachable - Whether the last status poll failed.
 * @returns What to tell the user, or `undefined` if the panel is live.
 */
function getAlert(
  status: ReturnType<typeof usePanelContext>['status'],
  isUnreachable: boolean,
): StaleStateAlert | undefined {
  // A failed run loop is reported even while unreachable. Nothing clears a
  // `failed` state — the kernel cannot revive in place — so a `failed` we have
  // once seen cannot have become untrue, and it names a cause that mere
  // unreachability does not.
  const runLoop = status?.runLoop;
  if (runLoop?.state === 'failed') {
    return {
      testId: 'run-loop-failure',
      headline:
        'Kernel run loop has died. Nothing shown below is live and no message will be processed until the kernel is restarted.',
      detail: runLoop.error,
    };
  }
  if (isUnreachable) {
    return {
      testId: 'kernel-unreachable',
      headline:
        'Cannot reach the kernel. Everything shown below is the last state we saw and may be out of date.',
      detail:
        'The kernel may be restarting, or its connection to this panel may be broken.',
    };
  }
  return undefined;
}

// Announces that what the rest of the panel shows is not live, for either of the
// two reasons that can be true: the kernel told us its run loop died, or we can
// no longer ask it at all. Worth saying loudly because every other panel keeps
// rendering its last known contents, so both cases otherwise look identical to a
// healthy idle kernel.
export const RunLoopBanner: React.FC = () => {
  const { status, isUnreachable } = usePanelContext();
  const alert = getAlert(status, isUnreachable);

  if (!alert) {
    return null;
  }

  return (
    <Box
      className="mb-4 p-3 border border-error-default rounded"
      data-testid={alert.testId}
      role="alert"
    >
      <TextComponent
        variant={TextVariant.BodyMd}
        color={TextColor.ErrorDefault}
        fontWeight={FontWeight.Bold}
      >
        {alert.headline}
      </TextComponent>
      <TextComponent
        variant={TextVariant.BodySm}
        color={TextColor.ErrorDefault}
        data-testid={`${alert.testId}-error`}
      >
        {alert.detail}
      </TextComponent>
    </Box>
  );
};
