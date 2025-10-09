# `@ocap/kernel-agents`

Capability-enabled, language-model-flow-controlled programming.

## Installation

`yarn add @ocap/kernel-agents`

or

`npm install @ocap/kernel-agents`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).

## Running E2E Tests

The end to end tests assume an [ollama](https://ollama.com/) server is running on `localhost:11343` and has the [DEFAULT_MODEL](./test/constants.ts) already pulled.

### Pulling an Ollama model (CLI)

`ollama pull 'llama3.1:latest'`

### Pulling an Ollama model (curl)

```sh
curl -X POST http://localhost:11434/api/pull -d '{
  "name": "llama3.1:latest"
}'
```

### Test Commands

To run the test suite, use the `yarn test:e2e` command. Ollama configuration errors will be detected by the [suite tests](./test/e2e/suite.test.ts).

To observe intermediate steps, including prompts provided to the agent, use the `--no-silent` flag.

```sh
yarn test:e2e --no-silent
```
