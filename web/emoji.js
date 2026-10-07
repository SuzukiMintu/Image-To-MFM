const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

// Examples are fetched from the server on demand; no example image is bundled.
export const emojiExample = Object.freeze({
  server: 'https://misskey.io', name: 'ai_embarrassed_misskeyio',
});

export function emojiRequest(server, emoji) {
  let url;
  try { url = new URL(server.trim()); } catch { throw new Error('サーバーのURLを入力してください。'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('サーバーは https:// から始まるURLで指定してください。');
  }
  const name = emoji.trim().replace(/^:([^:]+):$/, '$1');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) throw new Error('絵文字名を入力してください（例: aichan または :aichan:）。');
  return { endpoint: `${url.origin}/api/emoji`, name };
}

async function limitedBlob(response, limit, controller) {
  if (Number(response.headers.get('content-length')) > limit) {
    controller.abort(); throw new Error('画像または応答のサイズが大きすぎます。');
  }
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > limit) throw new Error('画像または応答のサイズが大きすぎます。');
    return blob;
  }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { controller.abort(); throw new Error('画像または応答のサイズが大きすぎます。'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Blob(chunks, { type: response.headers.get('content-type') || '' });
}

export async function fetchEmoji(server, emoji, { signal, fetcher = fetch, timeout = 15000 } = {}) {
  const { endpoint, name } = emojiRequest(server, emoji);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeout);
  const common = { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal };
  try {
    const response = await fetcher(endpoint, {
      ...common, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('絵文字が見つからないか、サーバーに接続できません。');
    const json = JSON.parse(await (await limitedBlob(response, 1024 * 1024, controller)).text());
    if (typeof json.url !== 'string') throw new Error('絵文字画像のURLがありません。');
    const imageUrl = new URL(json.url);
    if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password) throw new Error('絵文字画像のURLが正しくありません。');
    const image = await fetcher(imageUrl.href, common);
    if (!image.ok) throw new Error('絵文字画像を取得できません。');
    const blob = await limitedBlob(image, MAX_IMAGE_BYTES, controller);
    if (!blob.size) throw new Error('絵文字画像が空です。');
    return { blob, name, server: new URL(endpoint).host };
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', cancel);
  }
}
