// We set this property on globalThis in the background before lockdown.
Object.defineProperty(globalThis, 'kernel', {
  configurable: false,
  enumerable: true,
  writable: false,
  value: {},
});

export {};
