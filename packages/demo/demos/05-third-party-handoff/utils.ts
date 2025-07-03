import type { Logger } from '@metamask/logger';
import type { VatId, KRef, Kernel } from '@metamask/ocap-kernel';

const aliceRoot: KRef = 'ko2';
const bobVat: VatId = 'v3';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const makeAlice = (kernel: Kernel) => ({
  getCounter: async () => kernel.queueMessage(aliceRoot, 'getCounter', []),
  count: () => void kernel.queueMessage(aliceRoot, 'count', []),
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const makeBob = (kernel: Kernel, logger: Logger) => ({
  terminate: () => {
    logger.info('Terminating Bob');
    void kernel.terminateVat(bobVat);
  },
});
