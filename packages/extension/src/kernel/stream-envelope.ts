import type { KernelCommand, KernelCommandReply } from '@ocap/kernel';
import { isKernelCommand, isKernelCommandReply } from '@ocap/kernel';
import { makeStreamEnvelopeKit } from '@ocap/streams';
import type { ExtractGuardType } from '@ocap/utils';

import type { KernelControlCommand, KernelControlReply } from './messages.js';
import { isKernelControlCommand, isKernelControlReply } from './messages.js';

export enum EnvelopeLabel {
  Kernel = 'kernel',
  Control = 'control',
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const envelopeLabels = Object.values(EnvelopeLabel);

// Envelope kit for initial sends
const envelopeKit = makeStreamEnvelopeKit<
  typeof envelopeLabels,
  {
    kernel: KernelCommand;
    control: KernelControlCommand;
  }
>({
  kernel: isKernelCommand,
  control: isKernelControlCommand,
});

// Envelope kit for replies
const envelopeReplyKit = makeStreamEnvelopeKit<
  typeof envelopeLabels,
  {
    kernel: KernelCommandReply;
    control: KernelControlReply;
  }
>({
  kernel: isKernelCommandReply,
  control: isKernelControlReply,
});

export type StreamEnvelope = ExtractGuardType<
  typeof envelopeKit.isStreamEnvelope
>;
export type StreamEnvelopeReply = ExtractGuardType<
  typeof envelopeReplyKit.isStreamEnvelope
>;

export const wrapKernelCommand = envelopeKit.streamEnveloper.kernel.wrap;
export const wrapControlCommand = envelopeKit.streamEnveloper.control.wrap;
export const wrapKernelReply = envelopeReplyKit.streamEnveloper.kernel.wrap;
export const wrapControlReply = envelopeReplyKit.streamEnveloper.control.wrap;

export const { makeStreamEnvelopeHandler } = envelopeKit;
export const { makeStreamEnvelopeHandler: makeStreamEnvelopeReplyHandler } =
  envelopeReplyKit;
