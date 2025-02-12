import { Ollama } from 'ollama';

const ollama = new Ollama({ host: 'http://localhost:11434' });

const affix8k = '8k';

const models = {
  llm: ['1.5b', '7b'].map((size) => `deepseek-r1:${size}`),
  embeddings: ['mxbai-embed-large'],
};

const make8kModel = async (model: string) =>
  ollama.create({
    model: `${model}-${affix8k}`,
    from: model,
    parameters: {
      num_ctx: 8096,
    },
  });

const pull = async (
  modelsToPull: string[] = [...models.llm, ...models.embeddings],
) => {
  await Promise.all(modelsToPull.map(async (model) => ollama.pull({ model })));
};

const make8kLLMs = async (
  modelsToMake: string[] = [...models.llm, ...models.embeddings],
) => {
  await Promise.all(modelsToMake.map(async (model) => make8kModel(model)));
};

/**
 *
 */
export default async function main() {
  console.log('pulling models', models);
  await pull();
  console.log('making large context models', models.llm);
  await make8kLLMs();
}
