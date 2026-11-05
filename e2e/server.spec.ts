import { expect, test } from '@playwright/test';

const REQUIRED_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'referrer-policy',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'permissions-policy',
];

test('applies the security policy to pages, assets and 404s', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  expect(script).toBeTruthy();

  const cases = [
    ['/', 200],
    ['/new', 200],
    ['/maps/00000000-0000-4000-8000-000000000001', 200],
    [script as string, 200],
    ['/icon.svg', 200],
    ['/ort/ort-wasm-simd-threaded.mjs', 200],
    ['/does-not-exist', 404],
    ['/assets/missing.js', 404],
    ['/.env', 404],
    ['/../../etc/passwd', 404],
  ] as const;

  for (const [path, status] of cases) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(status);
    const headers = response.headers();
    for (const name of REQUIRED_HEADERS) expect(headers[name], `${name} on ${path}`).toBeTruthy();
  }

  expect((await request.get(script as string)).headers()['cache-control']).toContain('immutable');
  expect((await request.get('/')).headers()['cache-control']).toBe('no-cache');
});

test('accepts only read methods', async ({ request }) => {
  for (const method of ['post', 'put', 'delete', 'patch'] as const) {
    const response = await request[method]('/');
    expect(response.status(), method).toBe(405);
    expect(response.headers().allow).toBe('GET, HEAD');
    expect(response.headers()['content-security-policy']).toBeTruthy();
  }
  expect((await request.head('/')).status()).toBe(200);
});
