const SLOT_REF_PATTERN = /^(\$|&)(\d+)(?:\.(.+))?$/u;

/**
 * Convert a smallcaps-encoded CapData value into a plain JS value with
 * human-readable representations. This is a display-only transformation,
 * not a marshal decode.
 *
 * @param capData - The CapData to prettify.
 * @param capData.body - The smallcaps-encoded body string (prefixed with `#`).
 * @param capData.slots - The slot KRefs.
 * @returns The prettified value.
 */
export function prettifySmallcaps(capData: {
  body: string;
  slots: string[];
}): unknown {
  const { body, slots } = capData;
  if (!body.startsWith('#')) {
    throw new Error(
      `Expected body to start with '#', got: ${body.slice(0, 20)}`,
    );
  }

  const parsed: unknown = JSON.parse(body.slice(1));
  return walkValue(parsed, slots);
}

/**
 * Recursively walk a parsed smallcaps value, replacing encoded
 * representations with human-readable equivalents.
 *
 * @param value - The value to walk.
 * @param slots - The slot KRefs.
 * @returns The transformed value.
 */
function walkValue(value: unknown, slots: string[]): unknown {
  if (typeof value === 'string') {
    return walkString(value, slots);
  }

  if (Array.isArray(value)) {
    return value.map((item) => walkValue(item, slots));
  }

  if (typeof value === 'object' && value !== null) {
    return walkObject(value as Record<string, unknown>, slots);
  }

  return value;
}

/**
 * Decode a smallcaps-encoded string into a human-readable value.
 *
 * @param value - The encoded string.
 * @param slots - The slot KRefs.
 * @returns The decoded value.
 */
function walkString(value: string, slots: string[]): unknown {
  // Escaped string: strip the `!` prefix.
  if (value.startsWith('!')) {
    return value.slice(1);
  }

  // Slot refs: remotable ($N, $N.iface) and promise (&N).
  const match = SLOT_REF_PATTERN.exec(value);
  if (match) {
    const index = Number(match[2]);
    const kref = slots[index] ?? `?${index}`;
    const iface = match[3];
    return iface ? `<${kref}> (${iface})` : `<${kref}>`;
  }

  // Non-negative bigint (+N).
  if (value.startsWith('+')) {
    return `${value.slice(1)}n`;
  }

  // Negative bigint (-N).
  if (value.startsWith('-')) {
    return `${value}n`;
  }

  // Manifest constant (#undefined, #NaN, #Infinity, #-Infinity, #-0).
  if (value.startsWith('#')) {
    return `[${value.slice(1)}]`;
  }

  // Symbol (%name).
  if (value.startsWith('%')) {
    return `[Symbol: ${value.slice(1)}]`;
  }

  return value;
}

/**
 * Decode a smallcaps-encoded object, handling tagged values, errors, and
 * key unescaping.
 *
 * @param obj - The encoded object.
 * @param slots - The slot KRefs.
 * @returns The decoded value.
 */
function walkObject(obj: Record<string, unknown>, slots: string[]): unknown {
  // Tagged value: { "#tag": t, "payload": p }
  if ('#tag' in obj) {
    const tag = walkValue(obj['#tag'], slots);
    const payload = walkValue(obj.payload, slots);
    return { [`[Tagged: ${String(tag)}]`]: payload };
  }

  // Error: { "#error": msg, "name": "TypeError" }
  if ('#error' in obj) {
    const message = walkValue(obj['#error'], slots);
    const name = obj.name === undefined ? 'Error' : walkValue(obj.name, slots);
    return `[${String(name)}: ${String(message)}]`;
  }

  // Regular record — unescape keys with `!` prefix.
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const unescapedKey = key.startsWith('!') ? key.slice(1) : key;
    result[unescapedKey] = walkValue(val, slots);
  }
  return result;
}
