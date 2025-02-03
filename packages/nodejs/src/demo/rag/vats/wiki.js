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
  const { vectorStore } = vatPowers;
  const { docs } = parameters;

  console.log('DOCS:', docs);

  const initVectorStoreP = vectorStore.addDocuments([...docs]);

  return Far('root', {
    async retrieve(topic) {
      await initVectorStoreP;
      // Search for the most similar document
      const result = await vectorStore.similaritySearch(topic, 1);
      console.log('Retrieve got', result);
      return result;
    },
  });
}
