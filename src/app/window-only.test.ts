import { describe, expect, test } from 'bun:test';

import { enterUrl, newWindowKey, windowOnly } from './window-only';

const base = new URL('http://127.0.0.1:4000/');
const key = newWindowKey();
const fetch = windowOnly(
  key,
  async () => await Promise.resolve(new Response('app'))
);

describe('windowOnly', () => {
  test('lets the window in with its key, then by cookie', async () => {
    const entered = await fetch(new Request(enterUrl(base, key)));
    expect(entered.status).toBe(303);
    expect(entered.headers.get('location')).toBe('/');
    const cookie = entered.headers.get('set-cookie')!.split(';')[0]!;

    const page = await fetch(
      new Request(new URL('/d/demo/', base), { headers: { cookie } })
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toBe('app');
  });

  test('turns away a request without the cookie, or with another key', async () => {
    expect((await fetch(new Request(new URL('/', base)))).status).toBe(403);
    expect(
      (await fetch(new Request(enterUrl(base, newWindowKey())))).status
    ).toBe(403);
    const stale = `skp-viewer-window=${newWindowKey()}`;
    const req = new Request(new URL('/', base), { headers: { cookie: stale } });
    expect((await fetch(req)).status).toBe(403);
  });
});
