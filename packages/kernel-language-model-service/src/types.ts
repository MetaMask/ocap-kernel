export type ModelInfo<Options = unknown> = {
  archetype?: string;
  model: string;
  options?: Options;
};

export type LanguageModel<Options, Response> = {
  getInfo: () => Promise<ModelInfo<Options>>;

  /**
   * Loads the model into memory and keeps it alive indefinitely.
   *
   * @returns A promise that resolves when the model is loaded.
   */
  load: () => Promise<void>;
  /**
   * Unloads the model from memory.
   *
   * @returns A promise that resolves when the model is unloaded.
   */
  unload: () => Promise<void>;
  /**
   * @param prompt - The prompt to complete.
   * @param streams - The streams { internal, external } to write the response to.
   * @param options - The options to pass to the model.
   * @returns A promise that resolves when the response is complete, or rejects if an error occurs.
   */
  sample: (
    prompt: string,
    options?: Partial<Options>,
  ) => Promise<AsyncIterable<Response>>;
};

export type InstanceConfig<Options> =
  | {
      archetype: string;
      model?: never;
      options?: Partial<Options>;
    }
  | {
      archetype?: never;
      model: string;
      options?: Partial<Options>;
    };

export type LanguageModelService<Config, Options, Response> = {
  makeInstance: (
    config: InstanceConfig<Config>,
  ) => Promise<LanguageModel<Options, Response>>;
};
