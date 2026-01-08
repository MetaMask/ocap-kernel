# `@ocap/kernel-test-local`

Local-only E2E tests for kernel agents that require external dependencies.

## Overview

This package contains E2E tests that require a running Ollama instance with specific models installed. These tests are **not run in CI** and are intended for local development and validation only.

The tests verify kernel agent functionality with real language models, including:

- Semantic request processing
- Tool and capability usage
- Multi-step calculations
- Complex problem solving with code generation

Because language model outputs are inherently non-deterministic, these tests may occasionally fail even when the implementation is correct. This is expected behavior and why these tests are separated from the main CI pipeline.

## Prerequisites

### Install Ollama

1. Visit [https://ollama.ai](https://ollama.ai) and download Ollama for your platform
2. Install and start the Ollama service
3. Verify installation:

   ```bash
   curl http://localhost:11434
   ```

   You should see: `Ollama is running`

### Download Required Models

The tests require the following model:

- `llama3.1:latest`

Download the model:

```bash
ollama pull llama3.1:latest
```

Verify the model is available:

```bash
ollama list
```

You should see `llama3.1:latest` in the output.

## Running Tests

From the repository root:

```bash
yarn test:local
```

From this package directory:

```bash
yarn test:local
```

For watch mode during development:

```bash
yarn test:local:watch
```

## Test Configuration

- **Test timeout:** 30 seconds (60-120 seconds for complex tests)
- **Hook timeout:** 10 seconds
- **Requires:** Ollama running on localhost:11434
- **Model:** llama3.1:latest

## Test Suite

### suite.test.ts

Pre-test verification suite that checks:

- Ollama service is running and accessible
- Required models are available

These tests run sequentially and must pass before the main test suite.

### agents.test.ts

Main agent functionality tests that run for both JSON and REPL strategies:

1. **Processes a semantic request** - Tests semantic understanding by asking the agent to name an item from a category starting with a random letter
2. **Uses tools** - Verifies the agent can invoke capabilities (getMoonPhase)
3. **Performs multi-step calculations** - Tests mathematical reasoning without built-in tools
4. **Writes complex code to solve a problem** - Tests extended reasoning with a combinatorial problem (S2(42) set problem)
5. **Imports capabilities** - Tests dynamic capability imports (REPL only, not yet implemented)

Each test includes retry logic (2 retries) to account for LLM variability.

## Troubleshooting

### Connection refused errors

- Ensure Ollama is running: `ollama serve`
- Check port 11434 is accessible: `curl http://localhost:11434`
- Check for conflicting processes: `lsof -i :11434`

### Model not found errors

- List available models: `ollama list`
- Pull required model: `ollama pull llama3.1:latest`
- Verify model name matches exactly (including version tag)

### Timeout errors

Tests may timeout if:

- Model is not loaded in memory (first run after Ollama restart may be slow)
- System resources are constrained (CPU/memory)
- The LLM is struggling with the specific prompt

Try:

- Restarting Ollama: `killall ollama && ollama serve`
- Running tests individually to isolate issues
- Increasing available system resources

### Test failures due to LLM responses

These tests verify that agents can interact with language models, but the quality of responses depends on the model's capabilities. Occasional failures are expected, especially for:

- Complex reasoning tasks
- Code generation problems
- Multi-step calculations

If tests consistently fail, check:

- Model is loaded correctly: `ollama ps`
- Ollama logs for errors: Check console output from `ollama serve`
- System has adequate resources (8GB+ RAM recommended)

## Contributing

This package is part of the ocap-kernel monorepo. For contributing guidelines, see the [main repository README](https://github.com/MetaMask/ocap-kernel#readme).

### Adding New Tests

When adding new tests:

1. Place test files in `src/` directory with `.test.ts` extension
2. Use descriptive test names without "should" (e.g., "processes semantic request")
3. Include retry logic for non-deterministic tests
4. Set appropriate timeouts (30s for simple, 60-120s for complex)
5. Document expected behavior and known limitations

### Test Utilities

- **constants.ts** - Test configuration (models, endpoints)
- **utils.ts** - Helper functions for test setup and assertion
