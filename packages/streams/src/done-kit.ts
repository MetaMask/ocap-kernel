export type DoneResult = { done: true; value: undefined };

export const makeDoneResult = (): DoneResult => ({
  done: true,
  value: undefined,
});

type MaybeDone<Type = never> = Promise<Type | DoneResult>;

export type DoneKit = {
  setDone: () => Promise<void>;
  doIfNotDone: <Args extends unknown[]>(
    toDo: (...args: Args) => void,
  ) => (...args: Args) => MaybeDone;
  returnIfNotDone: <Return>(
    toReturn: () => Promise<Return>,
  ) => () => MaybeDone<Return>;
  callIfNotDone: <Args extends unknown[], Return>(
    toCall: (...args: Args) => Promise<Return>,
  ) => (...args: Args) => MaybeDone<Return>;
};

export const makeDoneKit = (onDone: () => Promise<void>): DoneKit => {
  let done: boolean = false;

  return {
    setDone: async () => {
      if (done) {
        return;
      }
      done = true;
      await onDone();
    },
    doIfNotDone:
      <Args extends unknown[]>(toDo: (...args: Args) => void) =>
      async (...args: Args) => {
        if (!done) {
          toDo(...args);
        }
        return makeDoneResult();
      },
    returnIfNotDone:
      <Return>(toReturn: () => Promise<Return>) =>
      async () => {
        if (done) {
          return makeDoneResult();
        }
        return await toReturn();
      },
    callIfNotDone:
      <Args extends unknown[], Return>(
        toCall: (...args: Args) => Promise<Return>,
      ) =>
      async (...args: Args) => {
        if (done) {
          return makeDoneResult();
        }
        return await toCall(...args);
      },
  };
};
