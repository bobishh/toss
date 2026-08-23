import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'dist', 'index.html'));

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');

  if (url.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('healthy\n');
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/agent') {
    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end(index);
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found\n');
});

server.listen(4243, '127.0.0.1', () => {
  console.log('Serving Toss at http://127.0.0.1:4243');
});
