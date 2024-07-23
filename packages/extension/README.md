# `@ocap/extension`

For running Ocap Kernel experiments in an extension environment.

## Usage

`yarn build` creates a production build of the extension, while `yarn start` runs a dev server with hot reloading.

To use the extension, load the `dist` directory as an unpacked extension in your
Chromium browser of choice. You may have to manually reload the extension on changes,
event with the dev server running.

The extension has no UI. To start the background service worker, click the extension's
action button in the browser bar. Once the service worker is running, inspect it via
`chrome://extensions`. With the console open, you can evaluate arbitrary strings in a
SES compartment:

```text
> await kernel.evaluate('[1, 2, 3].join(", ");')
< undefined
"1, 2, 3"
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
