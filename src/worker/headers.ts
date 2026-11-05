// Pure builders for the response policy. Everything here is covered by unit tests.

export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  // 'wasm-unsafe-eval' lets the on-device model's WebAssembly compile. No JS eval is allowed.
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // Cross-origin isolation enables the model's multi-threaded WebAssembly.
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy':
    'geolocation=(self), camera=(self), microphone=(), payment=(), usb=(), interest-cohort=()',
};

const CLIENT_ROUTE = /^\/(new|graph|ask|backup|maps\/[0-9a-f-]{36}(\/edit)?)?\/?$/;

export const isClientRoute = (pathname: string): boolean => CLIENT_ROUTE.test(pathname);

// Client routes all serve the app shell; anything else must match a real asset or 404.
export const assetPathFor = (pathname: string): string =>
  isClientRoute(pathname) ? '/' : pathname;

export const isAllowedMethod = (method: string): boolean =>
  method === 'GET' || method === 'HEAD';

// Vite fingerprints everything under /assets/, so those files never change.
export const cacheControlFor = (pathname: string): string =>
  pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
