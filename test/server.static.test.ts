import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';

let server: Server;
let port: number;
let stateFile: string;

before(async () => {
  const root = mkdtempSync(join(tmpdir(), 'doitwithme-static-'));
  const pub = join(root, 'public');
  mkdirSync(pub);
  writeFileSync(join(pub, 'index.html'), '<h1>home</h1>');
  writeFileSync(join(pub, 'app.js'), 'export {};');
  writeFileSync(join(pub, 'blob.exe'), 'x');
  writeFileSync(join(root, 'secret.txt'), 'TOPSECRET');
  symlinkSync(join(root, 'secret.txt'), join(pub, 'link.txt'));
  stateFile = join(root, 'db.json');
  server = createApp(stateFile, { publicDir: pub });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

after(() => {
  server.close();
});

function raw(path: string, method = 'GET'): Promise<{ status: number; headers: Record<string, any>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('/ serves index.html with security headers', async () => {
  const r = await raw('/');
  assert.equal(r.status, 200);
  assert.equal(r.body, '<h1>home</h1>');
  assert.match(r.headers['content-type'], /text\/html/);
  assert.equal(r.headers['content-security-policy'], "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('scripts get a JavaScript content type', async () => {
  const r = await raw('/app.js');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/javascript/);
});

test('missing files and unknown file types are 404', async () => {
  assert.equal((await raw('/missing.js')).status, 404);
  assert.equal((await raw('/blob.exe')).status, 404);
});

test('path traversal in every encoding never returns a file from outside public', async () => {
  const attempts = [
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/..%2fsecret.txt',
    '/%2e%2e%2fsecret.txt',
    '/..%5csecret.txt',
    '/%00',
    '/app.js%00.png',
    '/link.txt',
  ];
  for (const path of attempts) {
    const r = await raw(path);
    assert.ok(r.status === 404 || r.status === 400, `${path} gave ${r.status}`);
    assert.ok(!r.body.includes('TOPSECRET'), `${path} leaked the secret`);
  }
});

test('HEAD works without a body and other methods are 404', async () => {
  const head = await raw('/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal((await raw('/', 'POST')).status, 404);
});

test('API responses carry the security headers too', async () => {
  const r = await raw('/api/state');
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.match(r.headers['content-security-policy'], /default-src 'self'/);
});

test('/api/example returns a valid example state and writes nothing', async () => {
  const r = await raw('/api/example');
  assert.equal(r.status, 200);
  const state = JSON.parse(r.body);
  assert.ok(state.tasks.length > 0);
  assert.ok(Array.isArray(state.approvedSoft));
  assert.equal(existsSync(stateFile), false);
});
