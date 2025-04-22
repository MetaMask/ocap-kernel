import { Ollama } from 'ollama';
import type { ProgressResponse } from 'ollama';

const ollama = new Ollama({ host: 'http://localhost:11434' });

const affix8k = '8k';

const models = {
  llm: ['1.5b', '7b'].map((size) => `deepseek-r1:${size}`),
  embeddings: ['mxbai-embed-large'],
};

const make8kModel = async (model: string): Promise<ProgressResponse> =>
  ollama.create({
    model: `${model}-${affix8k}`,
    from: model,
    parameters: {
      // The `num_ctx` parameter denotes the context window size.
      // Blame python for the snake_case naming convention.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      num_ctx: 8096,
    },
  });

const pull = async (
  modelsToPull: string[] = [...models.llm, ...models.embeddings],
): Promise<ProgressResponse[]> => {
  return await Promise.all(
    modelsToPull.map(async (model) => ollama.pull({ model })),
  );
};

const make8kLLMs = async (
  modelsToMake: string[] = [...models.llm, ...models.embeddings],
): Promise<ProgressResponse[]> => {
  return await Promise.all(
    modelsToMake.map(async (model) => make8kModel(model)),
  );
};

/**
 * Pull and make the models.
 */
export default async function main(): Promise<void> {
  console.log('pulling models', models);
  await pull();
  console.log('making large context models', models.llm);
  await make8kLLMs();
}
