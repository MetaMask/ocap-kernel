/**
 * Read the response body as UTF-8 text. Throws if {@link Response.ok} is false.
 *
 * @param response - The fetch response.
 * @returns The full response body text.
 */
export async function readAndCheckResponse(
  response: Response,
): Promise<string> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} — ${body.slice(0, 500)}`,
    );
  }
  return body;
}

/**
 * If {@link Response.ok} is false, read the body as text and throw.
 * When OK, returns without reading the body so the stream remains available.
 *
 * @param response - The fetch response.
 */
export async function checkResponseOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const body = await response.text();
  throw new Error(
    `HTTP ${response.status} ${response.statusText} — ${body.slice(0, 500)}`,
  );
}
