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

### Environment variables

The Vite CLI does not accept custom command line options. Instead it is parameterized via environment variables.
The following environment variables are available:

|   Variable    |  Type   | Default | Description                                                                   |
| :-----------: | :-----: | :-----: | :---------------------------------------------------------------------------- |
| RESET_STORAGE | boolean | `false` | `true` if the kernel should reset its state on restart, and `false` otherwise |

## Development Setup

### CSS Modules TypeScript Support

This project uses CSS Modules with TypeScript integration.
To ensure proper type checking and autocompletion configure your IDE to use the workspace TypeScript version:

- VSCode:
  1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
  2. Type "TypeScript: Select TypeScript Version"
  3. Choose "Use Workspace Version"

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
