import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeGif } from '../web/gif.js';
import { inspectGif } from '../web/load-warning.js';

// Tiny independently encoded GIFs: reset the LZW dictionary before each literal.
function fixture(frames, width = 2, height = 1) {
  const bytes = [...Buffer.from('GIF89a'), width, 0, height, 0, 0x81, 0, 0,
    0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255];
  for (const frame of frames) {
    bytes.push(0x21, 0xf9, 4, (frame.disposal || 0) * 4 + 1, frame.delay || 8, 0, 0, 0,
      0x2c, frame.left || 0, 0, 0, 0, frame.width || width, 0, height, 0, frame.interlace ? 64 : 0);
    const codes = frame.indices.flatMap(index => [4, index]); codes.push(5);
    const compressed = new Uint8Array(Math.ceil(codes.length * 3 / 8));
    codes.forEach((code, i) => { for (let j = 0; j < 3; j++) if (code >> j & 1) compressed[(i * 3 + j) >> 3] |= 1 << ((i * 3 + j) & 7); });
    bytes.push(2, compressed.length, ...compressed, 0);
  }
  bytes.push(0x3b); return new Uint8Array(bytes).buffer;
}
const red = [255, 0, 0, 255], green = [0, 255, 0, 255], transparent = [0, 0, 0, 0];

test('GIF delta frames preserve transparency and restore previous/background disposal', () => {
  const decoded = decodeGif(fixture([
    { indices: [1, 1] }, { indices: [2], width: 1, disposal: 3 },
    { indices: [0, 3], disposal: 2 }, { indices: [2], width: 1 },
  ]));
  assert.deepEqual([...decoded.frames[0].pixels], [...red, ...red]);
  assert.deepEqual([...decoded.frames[1].pixels], [...green, ...red]);
  assert.deepEqual([...decoded.frames[2].pixels], [...red, 0, 0, 255, 255]);
  assert.deepEqual([...decoded.frames[3].pixels], [...green, ...transparent]);
  assert.equal(decoded.duration, 320);
  assert.deepEqual(decoded.frames.map(f => f.delay), [80, 80, 80, 80]);
});

test('interlaced row ordering and truncated GIF rejection', () => {
  const decoded = decodeGif(fixture([{ indices: [1, 2, 3, 1], interlace: true }], 1, 4));
  assert.deepEqual([...decoded.frames[0].pixels], [...red, 0, 0, 255, 255, ...green, ...red]);
  const bytes = fixture([{ indices: [1, 2] }]);
  assert.throws(() => decodeGif(bytes.slice(0, -2)));
  assert.throws(() => decodeGif(new ArrayBuffer(10)));
});

test('GIF inspection warns before decoding and accepts more than 256 frames', () => {
  const bytes = fixture(Array.from({ length: 257 }, () => ({ indices: [1] })), 1, 1);
  assert.equal(inspectGif(bytes).count, 257); assert.equal(decodeGif(bytes).frames.length, 257);
  const large = fixture([{ indices: [1] }, { indices: [2] }], 1, 1);
  const view = new DataView(large); view.setUint16(6, 6000, true); view.setUint16(8, 6000, true);
  assert.equal(inspectGif(large).decodedBytes, 6000 * 6000 * 4 * 2);
  assert.throws(() => inspectGif(bytes.slice(0, -1)));
});
