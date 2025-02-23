import { Far } from '@endo/marshal';
import { makeLogger } from '../../../../dist/demo/logger.mjs';

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
  const { model, verbose, documents, name } = parameters;
  const logger = makeLogger({ label: `[${name}.vectorStore]`, verbose });

  const { getVectorStore, ollama, loadDocument } = vatPowers;
  const vectorStore = getVectorStore();

  // By default, every stored document is maximally private.
  const DEFAULT_DOCUMENT_SECRECY = 1.0;
  const addDocuments = async (docs) => {
    logger.debug(
      'addDocuments:docs',
      JSON.stringify(docs, null, 2),
    );
    return await vectorStore.addDocuments(docs.map(
      (doc) => ({
        pageContent: doc.pageContent,
        metadata: {
          secrecy: DEFAULT_DOCUMENT_SECRECY,
          ...doc.metadata,
        },
      }),
    ));
  }

  // By default, views return only public documents,
  const DEFAULT_QUERY_SECRECY = 0.0;
  const makeSecrecyFilter = (secrecy = DEFAULT_QUERY_SECRECY) =>
    (doc) => doc.metadata.secrecy <= secrecy;

  // and not very many.
  const DEFAULT_QUERY_MAX_RESULTS = 3;
  const makeDocumentView = (
    secrecy = DEFAULT_QUERY_SECRECY,
    maxResults = DEFAULT_QUERY_MAX_RESULTS,
  ) => {
    let revoked = false;
    const filter = makeSecrecyFilter(secrecy);
    const query = async (topic, nResults) => {
      if (revoked) { return []; }
      const results = await vectorStore.similaritySearchWithScore(
        topic, nResults < maxResults ? nResults : maxResults, filter,
      )
      return results.map(([doc, score]) => ({
        pageContent: doc.pageContent,
        metadata: { relevance: score, ...doc.metadata },
      }));;
    };
    return Far('DocumentView', {
      query,
      getParameters: () => ({ maxResults }),
      revoke: () => { revoked = true; },
      isRevoked: () => revoked,
    });
  }

  return Far('root', {
    async init() {
      logger.debug('init');
      await ollama.pull({ model });
      const chunks = await Promise.all(documents.map(
        async ({ path, secrecy }) => {
          logger.debug({ path, secrecy });
          return await loadDocument(path, secrecy);
        }),
      );
      await addDocuments(chunks.flat());
    },
    addDocuments,
    makeDocumentView,
  });
}
