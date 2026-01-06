// Type declarations for omnium dev console API.
declare global {
  // eslint-disable-next-line no-var
  var omnium: {
    ping: () => Promise<void>;
  };
}

export {};
