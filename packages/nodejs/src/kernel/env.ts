import '@ocap/shims/endoify';
import fs from 'fs';

//
// these modificiations are used by the "@sqlite.org/sqlite-wasm" package
//

/**
 *
 * @param uri - file:// URI
 * @param mimeType - MIME type, default is 'text/plain'
 * @returns - fetch response
 */
async function fetchFile(
  uri: string,
  mimeType: string = 'text/plain',
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
): Promise<Response> {
  if (uri.startsWith('file://')) {
    try {
      const path = new URL(uri).pathname;
      const data = await fs.promises.readFile(path);
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      return new Response(data, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': mimeType },
      });
    } catch (error) {
      console.error('Error reading file:', error);
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      return new Response(null, { status: 404, statusText: 'File Not Found' });
    }
  }
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  return new Response(null, {
    status: 500,
    statusText: 'Only file:// supported',
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).self = globalThis;

const globalFetch = globalThis.fetch;
const wrappedFetchForSqliteWasm = async (
  url: string,
  options: RequestInit = {},
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
): Promise<Response> => {
  if (url.endsWith('@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm')) {
    return fetchFile(url, 'application/wasm');
  }
  console.log(`fetching ${url}`);
  return globalFetch(url, options);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = wrappedFetchForSqliteWasm;
