// Serves the static app and applies the security policy. It stores nothing.

import { SECURITY_HEADERS, assetPathFor, cacheControlFor, isAllowedMethod } from './headers';

type Env = { readonly ASSETS: Fetcher };

const withPolicy = (response: Response, pathname: string): Response => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.set('Cache-Control', cacheControlFor(pathname));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const methodNotAllowed = (): Response =>
  new Response('Method not allowed\n', {
    status: 405,
    headers: { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!isAllowedMethod(request.method)) return withPolicy(methodNotAllowed(), url.pathname);
    const assetUrl = new URL(assetPathFor(url.pathname), url.origin);
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));
    return withPolicy(response, url.pathname);
  },
} satisfies ExportedHandler<Env>;
