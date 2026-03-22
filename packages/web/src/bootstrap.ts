/**
 * @paradigm/web bootstrap — HTTP server entry point.
 *
 * Wraps WebEngine in a Node.js http.createServer with JSON parsing,
 * CORS headers, and OPTIONS preflight handling. Zero external deps.
 *
 * Usage:
 *   node packages/web/dist/bootstrap.js
 *   GSPL_PORT=8080 node packages/web/dist/bootstrap.js
 */

import * as http from 'node:http';
import { WebEngine } from './index.js';
import type { Request } from './index.js';

const port = Number(process.env['GSPL_PORT'] ?? 5001);
const host = process.env['GSPL_HOST'] ?? '0.0.0.0';

const engine = new WebEngine({ port, host });

function parseCorsHeaders(origin: string | undefined): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const qs: Record<string, string> = {};
  const parts = url.slice(idx + 1).split('&');
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k) qs[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return qs;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => { chunks.push(chunk); });
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf-8')); });
    req.on('error', reject);
  });
}

const server = http.createServer(async (httpReq, httpRes) => {
  const cors = parseCorsHeaders(httpReq.headers['origin']);
  for (const [k, v] of Object.entries(cors)) {
    httpRes.setHeader(k, v);
  }

  // Handle CORS preflight
  if (httpReq.method === 'OPTIONS') {
    httpRes.writeHead(204);
    httpRes.end();
    return;
  }

  const rawUrl = httpReq.url ?? '/';
  const path = rawUrl.split('?')[0] ?? '/';
  const query = parseQuery(rawUrl);

  let body: unknown;
  if (httpReq.method === 'POST' || httpReq.method === 'PUT') {
    const raw = await readBody(httpReq);
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw);
      } catch {
        httpRes.writeHead(400, { 'Content-Type': 'application/json' });
        httpRes.end(JSON.stringify({ status: 400, message: 'Invalid JSON body' }));
        return;
      }
    }
  }

  const request: Request = {
    method: (httpReq.method ?? 'GET') as Request['method'],
    path,
    params: {},
    query,
    body,
    headers: httpReq.headers as Record<string, string>,
  };

  const response = await engine.handle(request);

  httpRes.writeHead(response.status, {
    'Content-Type': 'application/json',
  });
  httpRes.end(JSON.stringify(response.body));
});

server.listen(port, host, () => {
  const status = engine.getStatus();
  console.log(`GSPL Paradigm server running at http://${host}:${port}`);
  console.log(`  Seeds loaded: ${status.seedCount}`);
  console.log(`  Routes:       ${status.routeCount}`);
  console.log(`  Agent tools:  6`);
});

export { engine, server };
