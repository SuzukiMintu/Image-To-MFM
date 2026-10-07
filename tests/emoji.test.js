import test from 'node:test';
import assert from 'node:assert/strict';
import { emojiRequest, fetchEmoji } from '../web/emoji.js';

test('emoji accepts a name or colon notation and normalizes server origin', () => {
  assert.deepEqual(emojiRequest(' https://example.com/about ', ':aichan:'), { endpoint: 'https://example.com/api/emoji', name: 'aichan' });
  for (const url of ['http://example.com', 'file:///tmp/x', 'https://user:secret@example.com', 'invalid']) {
    assert.throws(() => emojiRequest(url, 'aichan'));
  }
  assert.throws(() => emojiRequest('https://example.com', ':aichan@other:'));
});
test('emoji metadata resolves to a CDN image without sending credentials', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push([url, init]);
    return calls.length === 1 ? Response.json({ url: 'https://cdn.example.com/emoji.png' })
      : new Response(new Uint8Array([1,2,3]), { headers: { 'Content-Type': 'image/png' } });
  };
  const result = await fetchEmoji('https://example.com', ':aichan:', { fetcher });
  assert.equal(result.name, 'aichan'); assert.equal(result.blob.size, 3);
  assert.equal(calls[0][1].body, JSON.stringify({ name: 'aichan' }));
  assert.equal(calls[1][0], 'https://cdn.example.com/emoji.png');
  assert.ok(calls.every(([, init]) => init.credentials === 'omit' && init.mode === 'cors'));
});
test('API errors, missing URLs, unsafe URLs, CORS errors and image errors fail cleanly', async () => {
  const cases = [
    async () => new Response('', { status: 404 }),
    async () => Response.json({}),
    async () => Response.json({ url: 'javascript:alert(1)' }),
    async () => { throw new TypeError('Failed to fetch'); },
    async url => url.endsWith('/api/emoji') ? Response.json({ url: 'https://cdn.example.com/x' }) : new Response('', { status: 403 }),
    async url => url.endsWith('/api/emoji') ? Response.json({ url: 'https://cdn.example.com/x' }) : new Response('x', { headers: { 'Content-Length': String(31*1024*1024) } }),
  ];
  for (const fetcher of cases) await assert.rejects(fetchEmoji('https://example.com', 'aichan', { fetcher }));
});
test('timeout and caller cancellation abort requests', async () => {
  const fetcher = (url, { signal }) => new Promise((resolve, reject) => {
    const fail = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) fail(); else signal.addEventListener('abort', fail, { once: true });
  });
  await assert.rejects(fetchEmoji('https://example.com', 'aichan', { fetcher, timeout: 5 }), { name: 'AbortError' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchEmoji('https://example.com', 'aichan', { fetcher, signal: controller.signal }), { name: 'AbortError' });
});
