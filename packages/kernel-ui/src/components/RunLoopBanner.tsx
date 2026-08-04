import {
  Box,
  Text as TextComponent,
  TextColor,
  TextVariant,
  FontWeight,
} from '@metamask/design-system-react';

import { usePanelContext } from '../context/PanelContext.tsx';

// Announces that the kernel's run loop has died. Worth saying loudly because
// every other panel keeps rendering its last known contents, so a dead kernel
// looks identical to a healthy idle one.
export const RunLoopBanner: React.FC = () => {
  const { status } = usePanelContext();
  const runLoop = status?.runLoop;

  if (runLoop?.state !== 'failed') {
    return null;
  }

  return (
    <Box
      className="mb-4 p-3 border border-error-default rounded"
      data-testid="run-loop-failure"
    >
      <TextComponent
        variant={TextVariant.BodyMd}
        color={TextColor.ErrorDefault}
        fontWeight={FontWeight.Bold}
      >
        Kernel run loop has died. Nothing shown below is live and no message
        will be processed until the kernel is restarted.
      </TextComponent>
      <TextComponent
        variant={TextVariant.BodySm}
        color={TextColor.ErrorDefault}
        data-testid="run-loop-failure-error"
      >
        {runLoop.error}
      </TextComponent>
    </Box>
  );
};
