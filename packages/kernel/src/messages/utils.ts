// Uncapitalize.

export const uncapitalize = (value: string): Uncapitalize<string> =>
  (value.at(0)?.toLowerCase() + value.slice(1)) as Uncapitalize<string>;

// Union to intersection.
// https://github.com/sindresorhus/type-fest/blob/v2.12.2/source/union-to-intersection.d.ts

export type UnionToIntersection<Union> = (
  Union extends unknown ? (distributedUnion: Union) => void : never
) extends (mergedIntersection: infer Intersection) => void
  ? Intersection
  : never;
