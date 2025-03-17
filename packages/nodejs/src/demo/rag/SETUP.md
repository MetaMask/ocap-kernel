# Setup

The [demo](./README.md) uses a local large language model. This guide will help you install one.

If you are on a Mac, use the MacOS instructions to get automatic GPU integration via the ollama app. Docker won't connect to the GPU on a Mac.

Otherwise, use the Docker instructions, and consider the NVIDIA container setup to get GPU integration.

We'll be using the deepseek-r1 model, which comes in several brain sizes.

- For a weak workstation, try the smallest brained `1.5b`
- For a MacBook Pro type machine try `7b`
- If you have a beefier machine you might try bigger brain models.

## MacOS

### Download Ollama

Get the [ollama app](https://ollama.com/download/mac) and use it to install the ollama CLI.

### Pull DeepSeek-R1

For a MacBook you might try the 7B, but you can do 1.5B if you're light on space.

Smol brain:

```sh
ollama pull deepseek-r1:1.5b
```

Mid curve:

```sh
ollama pull deepseek-r1:7b
```

## Docker

### Get Docker

If you aren't familiar, you can just download the [desktop version](https://docs.docker.com/desktop/).

### Pull Ollama

If you downloaded the desktop version, search 'ollama' and pull the `ollama/ollama` image.

Or run this in your terminal.

```sh
docker pull ollama/ollama
```

### Start Ollama Container

You can just run things.

```sh
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
```

### Pull DeepSeek-R1

Smol brain:

```sh
curl -X POST http://localhost:11434/api/pull -d '{"model": "deepseek-r1:1.5b"}'
```

Mid curve:

```sh
curl -X POST http://localhost:11434/api/pull -d '{"model": "deepseek-r1:7b"}'
```

### Local Llama on a GPU

Peep the [ollama docs](https://github.com/ollama/ollama/blob/main/docs/docker.md) if you want to dock your local llama on a GPU.

# Check Your Llama

At this point, if you open a browser and navigate to `localhost:11434` you should see the following message.

```
Ollama is running
```

If you do, you're ready for the [demo](./README.md)!
