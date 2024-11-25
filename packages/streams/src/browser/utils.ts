export type PostMessage = (message: unknown, transfer?: Transferable[]) => void;
export type OnMessage = (event: MessageEvent<unknown>) => void;
