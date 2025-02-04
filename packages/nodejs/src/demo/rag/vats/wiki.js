import { Far } from '@endo/marshal';

/**
 * Build function for the LLM test vat.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} vatPowers.vectorStore - A vectorStore power.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, _baggage) {
  const { model } = parameters;
  const { getVectorStore, ollama } = vatPowers;
  const vectorStore = getVectorStore();

  return Far('root', {
    async initModels() {
      await ollama.pull({ model });
    },
    async addDocuments(docs) {
      console.time('wiki.addDocuments');
      await vectorStore.addDocuments(docs);
      console.timeEnd('wiki.addDocuments');
    },
    async retrieve(topic) {
      // Search for the most similar documents
      const results = await vectorStore.similaritySearch(topic, 3);
      console.log('Retrieve got', results);
      return results.map((document) => ({
        pageContent: document.pageContent,
        metadata: { source: document.metadata.source },
      }));
    },
  });
}
