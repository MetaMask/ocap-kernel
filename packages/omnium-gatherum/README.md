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
const installResult = await omnium.caplet.install(manifest);

// 3. Get the caplet's root kref
const capletInfo = await omnium.caplet.get(installResult.capletId);
const rootKref = capletInfo.rootKref;

// 4. Resolve the kref to an E()-usable presence
const echoRoot = omnium.resolveKref(rootKref);

// 5. Call the echo method
const result = await E(echoRoot).echo('Hello, world!');
console.log(result); // "echo: Hello, world!"
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
