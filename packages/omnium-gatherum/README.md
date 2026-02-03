# `@ocap/omnium-gatherum`

noun: a miscellaneous collection (as of things or persons)

## Installation

`yarn add @ocap/omnium-gatherum`

or

`npm install @ocap/omnium-gatherum`

## Usage

### Installing and using the `echo` caplet

After loading the extension, open the background console (chrome://extensions → Omnium → "Inspect views: service worker") and run the following:

```javascript
// 1. Load the echo caplet manifest
const { manifest } = await omnium.caplet.load('echo');

// 2. Install the caplet
await omnium.caplet.install(manifest);

// 3. Call a method on the caplet
await omnium.caplet.callCapletMethod('echo', 'echo', ['Hello, world!']);
// echo: Hello, world!
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
