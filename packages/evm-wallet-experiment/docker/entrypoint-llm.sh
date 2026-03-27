#!/bin/sh
set -e
# Start Ollama server in background
ollama serve > /logs/llm.log 2>&1 &

# Wait for Ollama to be ready (no curl in ollama image, use ollama CLI)
echo "Waiting for Ollama to start..."
until ollama list > /dev/null 2>&1; do
  sleep 1
done
echo "Ollama is ready."

# Pull the model (skipped if already cached in the ollama-models volume)
echo "Pulling qwen2.5:0.5b..."
ollama pull qwen2.5:0.5b 2>&1 | tee -a /logs/llm.log

echo "Model ready. Ollama running."
# Write readiness marker for Docker healthcheck
touch /tmp/llm-ready

# Keep container alive by following the log
tail -f /logs/llm.log
