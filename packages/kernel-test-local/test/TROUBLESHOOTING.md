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
