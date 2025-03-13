import { E } from '@endo/eventual-send';
import type { Document } from '@langchain/core/documents';

export type DocumentView = {
  query: (topic: string, nResults: number) => Promise<Document[]>;
  getParameters: () => object;
  revoke: () => void;
  isRevoked: () => boolean;
};

export type WithRelevance = {
  relevance: number;
} & Record<string, unknown>;

/**
 * Merge multiple document views into a single view.
 *
 * @param views - The document views to merge.
 * @returns A new document view that combines the results of the input views.
 */
export const mergeDocumentViews = (...views: DocumentView[]): DocumentView => {
  let revoked = false;
  return {
    query: async (topic: string, nResults: number) => {
      const results = await Promise.all(
        views.map(
          async (view: DocumentView) => await E(view).query(topic, nResults),
        ),
      );

      return results
        .flat()
        .sort((a, b) => b.metadata.relevance - a.metadata.relevance)
        .slice(0, nResults);
    },
    getParameters: () =>
      Object.fromEntries(
        views.map((view) => [view.constructor.name, view.getParameters()]),
      ),
    revoke: () => (revoked = true),
    isRevoked: () => revoked,
  };
};
