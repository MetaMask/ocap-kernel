/**
 * Returns a fetch implementation that responds to Open /v1 chat completion requests
 * with a sequence of non-streaming JSON responses (one content string per request).
 *
 * @param responses - Content strings to return, in order, for each request.
 * @param model - Model name to include in the response (default `'test-model'`).
 * @returns A fetch function suitable for use as an endowment.
 */
export const makeMockOpenV1Fetch = (
  responses: string[],
  model = 'test-model',
): typeof globalThis.fetch => {
  let idx = 0;
  return async (_url, _init) => {
    const content = responses[idx] ?? '';
    idx += 1;
    const result = {
      id: `chat-${idx}`,
      model,
      choices: [
        {
          message: { role: 'assistant', content },
          index: 0,
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    const bodyText = JSON.stringify(result);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => bodyText,
      json: async () => JSON.parse(bodyText),
    } as unknown as globalThis.Response;
  };
};
