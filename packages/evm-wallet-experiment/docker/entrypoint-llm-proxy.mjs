/* eslint-disable n/no-process-env, id-denylist */
/**
 * Lightweight LLM reverse proxy.
 *
 * Forwards all requests from http://0.0.0.0:11434 to an upstream LLM.
 * This lets the away node always talk to http://llm:11434 regardless of
 * whether the LLM is Ollama in a container or llama.cpp on the host.
 *
 * Env vars:
 *   LLM_UPSTREAM — upstream URL (default: http://host.docker.internal:8080)
 */

import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const upstream = new URL(
  process.env.LLM_UPSTREAM || 'http://host.docker.internal:8080',
);
const PORT = 11434;

const server = createServer((req, res) => {
  const target = new URL(req.url, upstream);
  const requester = target.protocol === 'https:' ? httpsRequest : httpRequest;

  const proxyReq = requester(
    target,
    {
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    console.error(
      `[llm-proxy] ${req.method} ${req.url} -> ${target}: ${err.message}`,
    );
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: `upstream unreachable: ${err.message}` }),
      );
    }
  });

  req.pipe(proxyReq);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[llm-proxy] forwarding :${PORT} -> ${upstream.origin}`);
});
