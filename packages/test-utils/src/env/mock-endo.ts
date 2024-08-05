// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

globalThis.lockdown = () => undefined;
globalThis.harden = <Value>(value: Value): Readonly<Value> => value;

export {};
