export type VatWorker = {
  launch: () => Promise<[MessagePort, unknown]>;
  terminate: () => Promise<void>;
};

export type PostMessage<Message> = (
  message: Message,
  transfer?: Transferable[],
) => void;
export type AddListener = (
  listener: (event: MessageEvent<unknown>) => void,
) => void;
