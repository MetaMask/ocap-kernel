// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

globalThis.lockdown = (): void => undefined;
globalThis.harden = <Value>(value: Value): Readonly<Value> => value;

export {};
