import { Far } from '@endo/marshal';

/**
 * Build function for the vector store vat.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} vatPowers.vectorStore - A vectorStore power.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, _baggage) {
  const { model, verbose } = parameters;
  const { getVectorStore, ollama } = vatPowers;
  const vectorStore = getVectorStore();

  const logger = {
    log: console.log,
    debug: verbose ? console.debug : () => {},
    error: console.error,
  };

  return Far('root', {
    async initModels() {
      await ollama.pull({ model });
    },
    async addDocuments(docs) {
      logger.debug(
        'vectorStore.addDocuments:docs',
        JSON.stringify(docs, null, 2),
      );
      // By default, every stored document is maximally private.
      await vectorStore.addDocuments(
        docs.map((doc) => ({
          pageContent: doc.pageContent,
          metadata: {
            ...doc.metadata,
          },
        })),
      );
    },
    /**
     * Retrieve from the vectorStore a list of fragments similar to the topic.
     *
     * @param {*} topic - A string to query against.
     * @param {*} accessCapability - An object representing the inquirer's access to stored fragments.
     * @returns A list of accessible documents relevant to the query.
     */
    async retrieve(topic, { secrecy }) {
      // By default, do not retrieve anything but public information.
      const access = (doc) => {
        logger.debug('vectorStore.retreive.access:doc', doc);
        const permit = doc.metadata.secrecy <= secrecy;
        logger.debug('vectorStore.retreive.access:permit', permit);
        return permit;
      };
      // Search for the most similar documents
      logger.debug('vectorStore.retrieve:topic', topic);
      const results = await vectorStore.similaritySearch(topic, 3, access);
      logger.debug('vectorStore.retrieve:results', results);
      return results.map((document) => ({
        pageContent: document.pageContent,
        metadata: { source: document.metadata.source },
      }));
    },
  });
}
