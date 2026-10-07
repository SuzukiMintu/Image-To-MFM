import test from 'node:test';
import assert from 'node:assert/strict';
import { convertAnimationToBudget, frameOptions } from '../web/animated-fit.js';
import { convert, options } from '../web/core.js';
import { switchFrames, mfmDepth } from '../web/switch-mfm.js';
import { conversionWarnings } from '../web/load-warning.js';

const pixels = (index, width, height) => new Uint8ClampedArray(Array.from({ length: width * height }, (_, p) =>
  p % 3 ? [40 + index * 50, 160, 90, 255] : [100, 10, 200, index ? 128 : 0]).flat());
const timing = { period: 2, durations: [1, 3], cellWidthEm: 0.625 };

test('GIF shares color, alpha, processing and glyph options with still-image conversion', async () => {
  for (const colorType of ['rgba4', 'rgb3', 'rgb6']) for (const mode of ['bg', 'fg']) {
    const input = { width: 4, height: 3, colors: 100, colorType, mode, background: '#123456', backgroundAlpha: 77,
      smooth: 1, division: 7, similar: 3, palette: 'global', scale: .7, depth: 19, cell: '█', optimize: true };
    const result = await convertAnimationToBudget(4, 3, 2, input, timing, { getPixels: pixels });
    assert.equal(result.usedOptions.colors, 100); assert.equal(result.usedOptions.depth, 5);
    assert.equal(result.widthEm, 2.5); assert.equal(result.fit.met, true);
    assert.ok(result.depth <= 20); assert.deepEqual(result.durations, [.5, 1.5]);
    result.frames.forEach((frame, i) => {
      const still = convert(pixels(i, 4, 3), 4, 3, frameOptions(input));
      assert.deepEqual(frame.pixels, still.pixels); assert.equal(frame.text, still.text);
      let depth = 0;
      for (const token of frame.text.match(/\$\[[^ ]+ |\]|\n/g)) {
        if (token.startsWith('$[')) depth++; else if (token === ']') depth--;
        else assert.equal(depth, 1, 'color tags close before every line break');
      }
    });
    assert.ok(result.length <= result.baselineLength);
  }
});

test('GIF accepts dimensions and palette counts above the former limits', async () => {
  const result = await convertAnimationToBudget(40, 30, 2, { width: 40, height: 30, colors: 128, optimize: false }, timing, { getPixels: pixels });
  assert.equal(result.width, 40); assert.equal(result.height, 30); assert.equal(result.usedOptions.colors, 128);
  assert.equal(options({ colors: 1000000 }).colors, 1000000);
});

test('GIF total character budget includes animation and shrinks all frames together', async () => {
  const calls = [];
  const opaque = (i, w, h) => new Uint8ClampedArray(Array.from({ length: w * h }, () => [i ? 0 : 255, 0, i ? 255 : 0, 255]).flat());
  const result = await convertAnimationToBudget(32, 16, 2, { width: 32, height: 16, colors: 0, targetLength: 2100 }, timing, {
    getPixels(i, w, h) { calls.push([i, w, h]); return opaque(i, w, h); },
  });
  assert.equal(result.fit.met, true); assert.ok(result.length <= 2100); assert.equal(result.fit.resized, true);
  assert.ok(calls.length > 2); assert.ok(result.frames.every(f => f.width === result.width && f.height === result.height));
  for (let p = 0; p < calls.length; p += 2) assert.deepEqual(calls[p].slice(1), calls[p + 1].slice(1));
  result.frames.forEach((frame, i) => assert.deepEqual(frame.pixels, convert(opaque(i, result.width, result.height), result.width, result.height, result.usedOptions).pixels));
});

test('GIF locked size and unreachable character budgets report failure explicitly', async () => {
  const locked = await convertAnimationToBudget(4, 3, 2, { width: 4, height: 3, colors: 2, targetLength: 1, allowResize: false }, timing, { getPixels: pixels });
  assert.equal(locked.fit.met, false); assert.equal(locked.width, 4); assert.equal(locked.height, 3);
  const tiny = await convertAnimationToBudget(4, 3, 2, { width: 4, height: 3, colors: 2, targetLength: 1 }, timing, { getPixels: pixels });
  assert.equal(tiny.fit.met, false); assert.equal(tiny.width, 1); assert.equal(tiny.height, 1);
  assert.equal(tiny.count, 2);
});

test('transparent animation gates every frame, including the first, at the intended midpoint', () => {
  const durations = [1, 3, 2], total = 6, width = 2;
  const result = switchFrames(['$[bg.color=f008 　]', '$[fg.color=00f8 █]', '　'], { widthEm: width, period: 6, durations, gateFirst: true });
  const vectors = [...result.text.matchAll(/position.x=([-\d.]+),y=([-\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
  const offsets = [...result.text.matchAll(/position.x=([-\d.]+) \$\[spin.speed/g)].map(m => Number(m[1]));
  let start = 0;
  durations.forEach((duration, index) => {
    const theta = (start + duration / 2) / total * 2 * Math.PI;
    const visible = offsets.map((offset, i) => offset - 312 * width + vectors[i * 2][0] * Math.cos(theta) - vectors[i * 2][1] * Math.sin(theta) < 0 ? i : -1).filter(i => i >= 0);
    assert.deepEqual(visible, [index]); start += duration;
  });
  assert.ok(mfmDepth(result.text) <= 20);
});

test('large settings produce confirmation reasons without clamping or rejecting them', () => {
  assert.deepEqual(conversionWarnings({ width: 16, height: 16 }, options({ width: 16 })), []);
  assert.ok(conversionWarnings({ width: 300, height: 80 }, options({ width: 0, height: 0, colors: 128 })).length >= 3);
  assert.ok(conversionWarnings({ width: 16, height: 16 }, options({ width: 16 }), { count: 257, decodedBytes: 16 * 16 * 4 * 257 }).length > 0);
  assert.equal(switchFrames(Array(257).fill('　'), { gateFirst: true }).count, 257);
});
