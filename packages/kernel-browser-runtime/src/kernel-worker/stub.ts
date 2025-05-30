// This is a hack to get Vite to bundle the web worker file correctly.
// This file should not be published.
// eslint-disable-next-line no-new
new Worker('./kernel-worker.js', { type: 'module' });
