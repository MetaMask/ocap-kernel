# `@ocap/extension`

For running Ocap Kernel experiments in an extension environment.

## Usage

Build options:

- `yarn build` for production builds
- `yarn build:dev` for development builds (source maps enabled, minification disabled)
- `yarn start` for watched development builds

To use the extension, load the `dist` directory as an unpacked extension in your
Chromium browser of choice. You have to manually reload the extension on changes,
even with `yarn start` running.

The extension has no UI. Simply inspect the extension's background service worker via
`chrome://extensions` to start it. With the console open, you can send commands via the `kernel` global.
This allows you to e.g. evaluate arbitrary strings in a SES compartment:

```text
> await kernel.evaluate('[1, 2, 3].join(", ");')
< undefined
"1, 2, 3"
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
