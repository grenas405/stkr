import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  assetPathFor,
  cacheControlFor,
  isAllowedMethod,
  isClientRoute,
} from './headers';

describe('content security policy', () => {
  it('denies by default and never allows JS eval, inline code or other origins', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-inline'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('http');
    expect(CONTENT_SECURITY_POLICY).not.toContain('*');
  });

  it('sets the headers that isolate the page', () => {
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    expect(SECURITY_HEADERS['Cross-Origin-Embedder-Policy']).toBe('require-corp');
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('no-referrer');
  });
});

describe('routing', () => {
  it.each([
    '/',
    '/new',
    '/graph',
    '/ask',
    '/backup',
    '/maps/00000000-0000-4000-8000-000000000001',
    '/maps/00000000-0000-4000-8000-000000000001/edit',
  ])('serves the app shell for %s', (path) => {
    expect(isClientRoute(path)).toBe(true);
    expect(assetPathFor(path)).toBe('/');
  });

  it.each(['/assets/app.js', '/missing', '/maps/not-an-id', '/.env', '/models/x.onnx'])(
    'does not treat %s as a client route',
    (path) => {
      expect(isClientRoute(path)).toBe(false);
      expect(assetPathFor(path)).toBe(path);
    },
  );
});

describe('methods and caching', () => {
  it('allows only reads', () => {
    expect(isAllowedMethod('GET')).toBe(true);
    expect(isAllowedMethod('HEAD')).toBe(true);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'TRACE']) {
      expect(isAllowedMethod(method)).toBe(false);
    }
  });

  it('caches only fingerprinted assets forever', () => {
    expect(cacheControlFor('/assets/app-abc123.js')).toContain('immutable');
    expect(cacheControlFor('/')).toBe('no-cache');
    expect(cacheControlFor('/sw.js')).toBe('no-cache');
  });
});
