const SLOT_REF_PATTERN = /^(\$|&)(\d+)(?:\.(.+))?$/u;

/**
 * Convert a smallcaps-encoded CapData value into a plain JS value with
 * human-readable slot references. This is a display-only transformation,
 * not a marshal decode.
 *
 * @param capData - The CapData to prettify.
 * @param capData.body - The smallcaps-encoded body string (prefixed with `#`).
 * @param capData.slots - The slot KRefs.
 * @returns The prettified value.
 */
export function prettifyCapData(capData: {
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
 * Recursively walk a parsed smallcaps value, replacing slot references with
 * readable placeholders.
 *
 * @param value - The value to walk.
 * @param slots - The slot KRefs.
 * @returns The transformed value.
 */
function walkValue(value: unknown, slots: string[]): unknown {
  if (typeof value === 'string') {
    const match = SLOT_REF_PATTERN.exec(value);
    if (match) {
      const index = Number(match[2]);
      const kref = slots[index] ?? `?${index}`;
      const iface = match[3];
      return iface ? `<${kref}> (${iface})` : `<${kref}>`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => walkValue(item, slots));
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = walkValue(val, slots);
    }
    return result;
  }

  return value;
}
