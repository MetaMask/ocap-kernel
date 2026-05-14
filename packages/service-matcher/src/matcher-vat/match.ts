/**
 * Stage-1 matcher logic: tokenize queries and service descriptions and
 * rank services by overlapping-token count.
 *
 * Intentionally simple — see the matcher vat's `findServices` for how
 * this is wired in, and `discovery-plan.md`'s matcher follow-ups for
 * the eventual LLM-backed Stage 2 / Stage 3 design.
 */

import type {
  ServiceDescription,
  ObjectSpec,
  TypeSpec,
} from '@metamask/service-discovery-types';

/**
 * Function-words and common filler that don't help disambiguate
 * services. Kept intentionally short — over-pruning hurts recall on
 * descriptions that are already only a sentence long.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'at',
  'with',
  'and',
  'or',
  'my',
  'your',
  'our',
  'for',
  'by',
  'is',
  'are',
  'be',
  'do',
  'this',
  'that',
  'it',
  'me',
  'i',
]);

/**
 * Tokenize a piece of text into lowercase alphanumeric atoms. Splits on
 * camelCase boundaries so method names like `signMessage` contribute
 * `sign` and `message` independently. Drops single-character tokens and
 * a small stopword set.
 *
 * @param text - Source text.
 * @returns Token strings.
 */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((tok) => tok.length > 1 && !STOPWORDS.has(tok));
}

/**
 * Walk a `TypeSpec` collecting method names from any nested
 * `RemotableSpec`. We follow into arrays, objects, unions, and remotable
 * specs — anywhere a future API extension might surface methods.
 *
 * @param type - Type spec to walk.
 * @param out - Accumulator into which method names are pushed.
 */
function collectMethodNamesFromType(type: TypeSpec, out: string[]): void {
  switch (type.kind) {
    case 'remotable':
      for (const methodName of Object.keys(type.spec.methods)) {
        out.push(methodName);
      }
      // A remotable's methods can return / accept other remotables; we
      // don't recurse into their parameter / return types to avoid
      // pulling in noise from deeply-nested API surfaces.
      break;
    case 'array':
      collectMethodNamesFromType(type.elementType, out);
      break;
    case 'object':
      collectMethodNamesFromObjectSpec(type.spec, out);
      break;
    case 'union':
      for (const member of type.members) {
        collectMethodNamesFromType(member, out);
      }
      break;
    default:
      // Primitive — nothing to collect.
      break;
  }
}

/**
 * Walk an `ObjectSpec` collecting method names from any properties that
 * resolve to a `RemotableTypeSpec`.
 *
 * @param spec - Object spec to walk.
 * @param out - Accumulator.
 */
function collectMethodNamesFromObjectSpec(
  spec: ObjectSpec,
  out: string[],
): void {
  for (const value of Object.values(spec.properties)) {
    collectMethodNamesFromType(value.type, out);
  }
}

/**
 * Extract the bag of tokens that the matcher will compare a query
 * against, drawn from a service's natural-language description and
 * the method names exposed in its API spec.
 *
 * @param description - The full service description.
 * @returns A set of distinct tokens.
 */
export function extractServiceTokens(
  description: ServiceDescription,
): Set<string> {
  const tokens = new Set<string>(tokenize(description.description));
  const methodNames: string[] = [];
  collectMethodNamesFromObjectSpec(description.apiSpec, methodNames);
  for (const name of methodNames) {
    for (const tok of tokenize(name)) {
      tokens.add(tok);
    }
  }
  return tokens;
}

/**
 * One ranked match emitted by the matcher.
 */
export type RankedMatch = {
  description: ServiceDescription;
  score: number;
  matchedTokens: string[];
};

/**
 * Score every registered service against `queryText` and return the
 * subset with at least one overlapping token, sorted by descending
 * score. Ties keep their insertion order.
 *
 * @param services - Iterable of candidate service descriptions.
 * @param queryText - Free-form query text.
 * @returns Ranked matches; empty if nothing overlapped.
 */
export function rankServices(
  services: Iterable<ServiceDescription>,
  queryText: string,
): RankedMatch[] {
  const queryTokens = new Set(tokenize(queryText));
  if (queryTokens.size === 0) {
    return [];
  }
  const ranked: RankedMatch[] = [];
  for (const description of services) {
    const serviceTokens = extractServiceTokens(description);
    const matchedTokens: string[] = [];
    for (const tok of queryTokens) {
      if (serviceTokens.has(tok)) {
        matchedTokens.push(tok);
      }
    }
    if (matchedTokens.length > 0) {
      ranked.push({
        description,
        score: matchedTokens.length,
        matchedTokens,
      });
    }
  }
  // Stable sort by descending score (insertion order preserved on ties).
  ranked.sort((left, right) => right.score - left.score);
  return ranked;
}
