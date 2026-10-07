// GIF87a/89a decoder: LZW, local palettes, interlace, transparency and disposal.
// Each returned frame is a complete RGBA canvas, never a delta rectangle.
export function decodeGif(buffer) {
  const bytes = new Uint8Array(buffer); let pos = 0;
  const byte = () => { if (pos >= bytes.length) throw new Error('GIFのデータが途中で切れています。'); return bytes[pos++]; };
  const word = () => byte() | byte() << 8;
  const take = count => { if (pos + count > bytes.length) throw new Error('GIFのデータが途中で切れています。'); const result = bytes.slice(pos, pos + count); pos += count; return result; };
  const signature = String.fromCharCode(...take(6));
  if (!['GIF87a', 'GIF89a'].includes(signature)) throw new Error('GIF形式の画像ではありません。');
  const width = word(), height = word(), flags = byte(), bgIndex = byte(); byte();
  if (!width || !height) throw new Error('GIFのサイズが不正です。');
  const palette = count => take(count * 3);
  const global = flags & 128 ? palette(1 << ((flags & 7) + 1)) : null;
  const blocks = () => { const parts = []; let total = 0, n; while ((n = byte())) { const part = take(n); parts.push(part); total += n; } const result = new Uint8Array(total); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; };
  const canvas = new Uint8ClampedArray(width * height * 4), frames = [];
  let gce = { delay: 100, rawDelay: 0, disposal: 0, transparent: -1 }, previous = null, loops = null;
  const clearRect = (rect, transparent) => {
    const color = transparent || !global ? [0, 0, 0, 0] : [...global.slice(bgIndex * 3, bgIndex * 3 + 3), 255];
    for (let y = rect.top; y < rect.top + rect.height; y++) for (let x = rect.left; x < rect.left + rect.width; x++) {
      if (x < width && y < height) canvas.set(color, (y * width + x) * 4);
    }
  };
  let trailer = false;
  while (pos < bytes.length) {
    const tag = byte();
    if (tag === 0x3b) { trailer = true; break; }
    if (tag === 0x21) {
      const type = byte();
      if (type === 0xf9) {
        if (byte() !== 4) throw new Error('GIFの制御ブロックが不正です。');
        const packed = byte(), delay = word(), index = byte();
        if (byte() !== 0) throw new Error('GIFの制御ブロックが不正です。');
        gce = { disposal: packed >> 2 & 7, rawDelay: delay * 10,
          delay: delay <= 1 ? 100 : delay * 10, transparent: packed & 1 ? index : -1 };
      } else {
        const data = blocks();
        if (type === 0xff && String.fromCharCode(...data.slice(0, 11)).startsWith('NETSCAPE') && data[11] === 1) loops = data[12] | data[13] << 8;
      }
      continue;
    }
    if (tag !== 0x2c) throw new Error('GIFのブロックが不正です。');
    const left = word(), top = word(), w = word(), h = word(), packed = byte();
    if (!w || !h || left + w > width || top + h > height) throw new Error('GIFのコマの範囲が不正です。');
    const colors = packed & 128 ? palette(1 << ((packed & 7) + 1)) : global;
    if (!colors) throw new Error('GIFの色データがありません。');
    const indices = lzw(blocksAfterCode(), w * h);
    function blocksAfterCode() { const minimum = byte(); return { minimum, data: blocks() }; }
    if (previous?.disposal === 2) clearRect(previous, previous.transparent >= 0);
    else if (previous?.disposal === 3 && previous.saved) canvas.set(previous.saved);
    if (!frames.length) clearRect({ top: 0, left: 0, width, height }, gce.transparent >= 0);
    const saved = gce.disposal === 3 ? canvas.slice() : null;
    const rows = packed & 64 ? [0, 4, 2, 1].flatMap((start, pass) => {
      const result = [], step = [8, 8, 4, 2][pass]; for (let y = start; y < h; y += step) result.push(y); return result;
    }) : Array.from({ length: h }, (_, y) => y);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const color = indices[y * w + x];
      if (color === gce.transparent) continue;
      if (color * 3 + 2 >= colors.length) throw new Error('GIFの色番号が不正です。');
      canvas.set([colors[color * 3], colors[color * 3 + 1], colors[color * 3 + 2], 255], ((top + rows[y]) * width + left + x) * 4);
    }
    frames.push({ pixels: canvas.slice(), delay: gce.delay, rawDelay: gce.rawDelay });
    previous = { left, top, width: w, height: h, disposal: gce.disposal, transparent: gce.transparent, saved };
    gce = { delay: 100, rawDelay: 0, disposal: 0, transparent: -1 };
  }
  if (!trailer || !frames.length) throw new Error('GIFの終端または画像データがありません。');
  return { width, height, frames, loops, duration: frames.reduce((sum, frame) => sum + frame.delay, 0) };
}

function lzw({ minimum, data }, count) {
  if (minimum < 2 || minimum > 8) throw new Error('GIFの圧縮データが不正です。');
  const clear = 1 << minimum, end = clear + 1;
  const prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097), result = new Uint8Array(count);
  for (let i = 0; i < clear; i++) suffix[i] = i;
  let bits = minimum + 1, next = end + 1, previous = -1, first = 0, bit = 0, written = 0;
  while (bit + bits <= data.length * 8) {
    let code = 0; for (let i = 0; i < bits; i++) { code |= (data[bit >> 3] >> (bit & 7) & 1) << i; bit++; }
    if (code === clear) { bits = minimum + 1; next = end + 1; previous = -1; continue; }
    if (code === end) break;
    const incoming = code; let size = 0;
    if (code === next && previous >= 0) { stack[size++] = first; code = previous; }
    else if (code >= next) throw new Error('GIFのLZWコードが不正です。');
    while (code >= clear) { if (size >= 4096 || code >= next) throw new Error('GIFのLZW辞書が不正です。'); stack[size++] = suffix[code]; code = prefix[code]; }
    first = suffix[code]; stack[size++] = first;
    while (size) { if (written >= count) throw new Error('GIFの画素数が不正です。'); result[written++] = stack[--size]; }
    if (previous >= 0 && next < 4096) {
      prefix[next] = previous; suffix[next] = first; next++;
      if (next === 1 << bits && bits < 12) bits++;
    }
    previous = incoming;
  }
  if (written !== count) throw new Error('GIFの圧縮データが途中で切れています。');
  return result;
}
