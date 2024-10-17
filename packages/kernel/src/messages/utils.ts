// Uncapitalize.

export const uncapitalize = (value: string): Uncapitalize<string> =>
  (value.at(0)?.toLowerCase() + value.slice(1)) as Uncapitalize<string>;
