import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const port = Number(process.env.PORT ?? '4243');

function presetIndex(identity, userAgent) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(`${identity}\n${userAgent}`)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 4;
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');

  if (url.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('healthy\n');
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/agent') {
    const forwarded = request.headers['x-forwarded-for'];
    const identity = Array.isArray(forwarded)
      ? forwarded.join(',')
      : forwarded || request.socket.remoteAddress || 'unknown';
    const userAgent = request.headers['user-agent'] || '';
    const body = index.replace(
      '__DEFAULT_PICKER_INDEX__',
      String(presetIndex(identity, userAgent)),
    );
    response.writeHead(200, {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end(body);
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found\n');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving Toss at http://127.0.0.1:${port}`);
});
