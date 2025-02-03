# RAG Demo
For this demo, we'll be connecting to a locally hosted LLM over the ollama API. Follow the [setup guide](./SETUP.md) to get your ollama running on `localhost:11434`.

If you prefer to figure things out yourself, [have at](https://ollama.com/).

### Start Ocap CLI
From the `@ocap/nodejs` package, run this in one terminal.
```sh
yarn ocap start src/demo/rag/vats
```

### Run RAG Demo
And then run this in another terminal.
```sh
yarn demo:rag
```
