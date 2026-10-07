import { resizeDimensions } from './core.js';

// Inspect compressed block boundaries without allocating decoded frame pixels.
export function inspectGif(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (bytes.length < 13 || !['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.subarray(0, 6)))) throw new Error('GIFのヘッダーが不正です。');
  const width = view.getUint16(6, true), height = view.getUint16(8, true);
  let p = 13 + (bytes[10] & 128 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0), count = 0, ended = false;
  const skipBlocks = () => { while (p < bytes.length) { const n = bytes[p++]; if (!n) return; p += n; if (p > bytes.length) break; } throw new Error('GIFのデータが途中で切れています。'); };
  while (p < bytes.length) {
    const marker = bytes[p++];
    if (marker === 0x3b) { ended = true; break; }
    if (marker === 0x21) { p++; skipBlocks(); }
    else if (marker === 0x2c) {
      if (p + 9 > bytes.length) throw new Error('GIFの画像情報が不正です。');
      const flags = bytes[p + 8]; p += 9;
      if (flags & 128) p += 3 * (1 << ((flags & 7) + 1));
      p++; skipBlocks(); count++;
    } else throw new Error('GIFのブロックが不正です。');
  }
  if (!width || !height || !count || !ended) throw new Error('GIFの終端または画像データがありません。');
  return { width, height, count, decodedBytes: width * height * 4 * count };
}

export function conversionWarnings(source, settings, gif = null, fileBytes = 0) {
  const size = resizeDimensions(source.width, source.height, settings), reasons = [];
  const pixels = size.width * size.height, count = gif?.count || 1;
  if (gif ? size.width > 24 || size.height > 24 : size.width > 256 || size.height > 256 || pixels > 16384) {
    reasons.push(`生成サイズは${size.width.toLocaleString()} × ${size.height.toLocaleString()} pxです。大きなMFMは表示欄で折り返されたり、生成に時間がかかる場合があります。`);
  }
  if (settings.colors > 64) reasons.push(`色数は${settings.colors.toLocaleString()}です。減色の計算に時間がかかる場合があります。`);
  if (gif && (count > 256 || pixels * count > 1000000 || gif.decodedBytes > 128 * 1024 * 1024)) {
    reasons.push(`GIFは${count.toLocaleString()}コマです。展開した画素だけで約${Math.ceil(gif.decodedBytes / 1024 / 1024).toLocaleString()} MBを使い、変換処理ではさらに容量が必要です。`);
  }
  if (fileBytes > 30 * 1024 * 1024) reasons.push(`入力画像は約${Math.ceil(fileBytes / 1024 / 1024)} MBです。`);
  if (reasons.length) reasons.push('ブラウザーや端末の容量を超えると、生成できなかったりページの動作が不安定になる場合があります。続行しますか？');
  return reasons;
}
